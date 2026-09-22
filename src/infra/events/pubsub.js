/**
 * truman-town.infra.events.pubsub — 发布订阅 / Pub/Sub
 *
 * 沙盘事件总线：模块通过 subscribe(topic, handler) 订阅事件，
 * 通过 publish(topic, payload) 同步派发。handler 抛错会被隔离并记录，
 * 不中断其余订阅者。topic '*' 表示订阅全部事件。
 */

/** @typedef {(payload: unknown, meta: { topic: string, ts: number }) => void} EventHandler */

/** @type {Map<string, Set<EventHandler>>} */
const handlers = new Map();
/** @type {Set<EventHandler>} */
const wildcard = new Set();

/**
 * 订阅某 topic。返回取消订阅函数（幂等）。
 * @param {string} topic 事件主题，'*' 匹配全部
 * @param {EventHandler} handler
 * @returns {() => void} 取消订阅函数
 */
export function subscribe(topic, handler) {
  if (typeof topic !== 'string' || topic.trim() === '') {
    throw new TypeError('pubsub.subscribe: topic 必须为非空字符串');
  }
  if (typeof handler !== 'function') {
    throw new TypeError('pubsub.subscribe: handler 必须为函数');
  }
  if (topic === '*') {
    wildcard.add(handler);
    return () => wildcard.delete(handler);
  }
  let set = handlers.get(topic);
  if (set === undefined) {
    set = new Set();
    handlers.set(topic, set);
  }
  set.add(handler);
  return () => {
    set.delete(handler);
    if (set.size === 0) handlers.delete(topic);
  };
}

/**
 * 向某 topic 派发事件，同步调用全部匹配订阅者。
 * @param {string} topic
 * @param {unknown} [payload]
 * @returns {number} 实际调用的 handler 数量
 */
export function publish(topic, payload) {
  if (typeof topic !== 'string' || topic.trim() === '') {
    throw new TypeError('pubsub.publish: topic 必须为非空字符串');
  }
  const meta = { topic, ts: Date.now() };
  const targets = [];
  const exact = handlers.get(topic);
  if (exact !== undefined) targets.push(...exact);
  targets.push(...wildcard);

  let delivered = 0;
  for (const handler of targets) {
    try {
      handler(payload, meta);
      delivered += 1;
    } catch (err) {
      console.error(`[pubsub] handler for "${topic}" 抛错：`, err);
    }
  }
  return delivered;
}

/** 清空全部订阅（测试用）。 */
export function __reset() {
  handlers.clear();
  wildcard.clear();
}
