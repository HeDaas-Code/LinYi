/**
 * truman-town.infra.events.retry — 事件重试与死信处理。
 *
 * 订阅失败的事件进入重试队列，按指数退避重投；超过上限则进入死信队列。
 *
 * 设计取舍：
 * - **退避基于「重试轮次」而非墙钟**：沙盘是按 tick 推进的确定性系统，
 *   用真实时间做退避会让同种子重放结果不稳定。故 deliver(now) 由调用方
 *   在每次事件泵推进时传入当前 tick，重试条件为 tick >= dueAt。
 * - **死信不丢弃**：超过上限的记录保留在死信队列并带最后错误，
 *   便于观察者审计「哪些事件永远失败了」，而不是静默吞掉。
 * - **重投走真实 pubsub**：重试不是本模块自己调用 handler，而是重新 publish，
 *   这样所有订阅者都能再次收到，语义与首次投递一致。
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY = 2;

/** key -> 待重试条目 */
const queue = new Map();
/** 死信列表（只增，供审计） */
const deadLetters = [];
let stats = { enqueued: 0, delivered: 0, dropped: 0 };

/**
 * 把一次失败投递入队。
 * @param {{key: string, topic: string, payload?: any, error?: string, attempts?: number,
 *          maxAttempts?: number, baseDelay?: number, now?: number}} input
 */
export function enqueue(input = {}) {
  const key = input.key;
  if (typeof key !== 'string' || key === '') throw new TypeError('events.retry.enqueue: 需要非空 key');
  const topic = input.topic;
  if (typeof topic !== 'string' || topic === '') throw new TypeError('events.retry.enqueue: 需要非空 topic');
  const attempts = Number.isInteger(input.attempts) ? input.attempts : 0;
  const maxAttempts = Number.isInteger(input.maxAttempts) && input.maxAttempts > 0
    ? input.maxAttempts : DEFAULT_MAX_ATTEMPTS;
  const baseDelay = Number.isInteger(input.baseDelay) && input.baseDelay >= 0
    ? input.baseDelay : DEFAULT_BASE_DELAY;
  const now = typeof input.now === 'number' ? input.now : 0;
  // 指数退避：第 n 次重试等待 baseDelay * 2^(n-1)，避免同 tick 内反复撞击。
  const delay = baseDelay * Math.pow(2, attempts);
  const entry = {
    key, topic, payload: input.payload ?? null, error: input.error ?? null,
    attempts, maxAttempts, baseDelay, dueAt: now + delay,
  };
  // 同 key 再次入队视为「更新」而非新增，避免同一事件的失败被重复计数。
  const existed = queue.has(key);
  queue.set(key, entry);
  if (!existed) stats.enqueued += 1;
  return { key, attempts, dueAt: entry.dueAt, queued: queue.size };
}

/**
 * 推进事件泵：投递所有到期的重试。
 * @param {{now?: number, deliver?: Function}} input deliver(topic, payload, entry) 由调用方注入
 */
export function run(input = {}) {
  const now = typeof input.now === 'number' ? input.now : 0;
  const deliver = input.deliver;
  if (typeof deliver !== 'function') throw new TypeError('events.retry.run: 需要 deliver 函数');
  const done = [];
  const failed = [];
  for (const [key, entry] of [...queue.entries()]) {
    if (entry.dueAt > now) continue;
    try {
      deliver(entry.topic, entry.payload, entry);
      queue.delete(key);
      stats.delivered += 1;
      done.push({ key, topic: entry.topic, attempts: entry.attempts + 1 });
    } catch (err) {
      entry.attempts += 1;
      entry.error = err && err.message ? err.message : String(err);
      if (entry.attempts >= entry.maxAttempts) {
        queue.delete(key);
        stats.dropped += 1;
        deadLetters.push({ ...entry, deadAt: now });
        failed.push({ key, topic: entry.topic, attempts: entry.attempts, dead: true, error: entry.error });
      } else {
        entry.dueAt = now + entry.baseDelay * Math.pow(2, entry.attempts);
        failed.push({ key, topic: entry.topic, attempts: entry.attempts, dead: false, error: entry.error, dueAt: entry.dueAt });
      }
    }
  }
  return { now, delivered: done, failed, pending: queue.size, dead: deadLetters.length };
}

export function pending() {
  return [...queue.values()].map((e) => ({ ...e, payload: undefined }));
}

export function dead() {
  return deadLetters.map((e) => ({ ...e, payload: undefined }));
}

export function getStats() {
  return { ...stats, pending: queue.size, dead: deadLetters.length };
}

export function __reset() {
  queue.clear();
  deadLetters.length = 0;
  stats = { enqueued: 0, delivered: 0, dropped: 0 };
}

// ---- 持久化：事件重试队列与死信必须进存档 ----

/**
 * 导出重试队列、死信与统计。
 *
 * 未投递的重试条目携带 dueAt（tick 语义），是「未来该发生但还没发生」的工作。
 * 不入档则恢复后这些工作凭空消失：订阅者永远收不到那次重投，而死信记录
 * （审计「哪些事件永远失败」）也会丢失。
 */
export function __snapshot() {
  return {
    queue: [...queue.entries()].map(([key, e]) => ({ key, ...structuredClone(e) })),
    deadLetters: structuredClone(deadLetters),
    stats: { ...stats },
  };
}

/**
 * 恢复重试队列（整体替换）。
 * @param {{queue?: Array<object>, deadLetters?: Array<object>, stats?: object}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('events.retry.__restore: 状态必须为对象');
  }
  queue.clear();
  deadLetters.length = 0;
  const list = Array.isArray(data.queue) ? data.queue : [];
  for (const entry of list) {
    const { key, ...rest } = entry;
    if (typeof key !== 'string' || key === '') continue;
    queue.set(key, structuredClone(rest));
  }
  if (Array.isArray(data.deadLetters)) deadLetters.push(...structuredClone(data.deadLetters));
  const st = data.stats;
  stats = {
    enqueued: Number.isInteger(st?.enqueued) ? st.enqueued : 0,
    delivered: Number.isInteger(st?.delivered) ? st.delivered : 0,
    dropped: Number.isInteger(st?.dropped) ? st.dropped : 0,
  };
  return { queue: queue.size, dead: deadLetters.length };
}
