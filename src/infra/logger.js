/**
 * truman-town.infra.logger — 结构化运行日志 / Structured Runtime Log
 *
 * 为什么需要它：此前全仓库没有任何日志层，进程只往 stdout 打一行启动信息，
 * 于是「模型调用失败」「tick 卡住」「回退到规则」这些事实**不可观测**——
 * 出了问题只能靠猜。本模块提供最小的、可开关的结构化日志与环形缓冲。
 *
 * 设计取舍：
 *   - **零依赖、同步写**：不做异步缓冲，避免日志本身影响 tick 时序。
 *   - **级别过滤**：默认 info；LINYI_LOG_LEVEL=debug|info|warn|error|silent 可调。
 *   - **环形缓冲**：内存保留最近 N 条供 API 查询（/api/v1/sim/logs），
 *     控制台输出与缓冲解耦——缓冲恒开，控制台按级别。
 *   - **不记录密钥**：payload 由调用方负责脱敏；本模块只做 JSON 序列化。
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const DEFAULT_CAPACITY = 500;

let level = LEVELS[process.env.LINYI_LOG_LEVEL] ?? LEVELS.info;
let capacity = DEFAULT_CAPACITY;
const buffer = [];
const counters = { debug: 0, info: 0, warn: 0, error: 0 };

function serialize(payload) {
  if (payload === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return String(payload);
  }
}

function write(lvl, topic, message, payload) {
  if (LEVELS[lvl] < level) return null;
  counters[lvl] += 1;
  const entry = { at: Date.now(), level: lvl, topic, message: String(message ?? ''), payload: serialize(payload) };
  buffer.push(entry);
  if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity);
  if (level <= LEVELS.silent) {
    const stamp = new Date(entry.at).toISOString();
    const tail = entry.payload === null ? '' : ' ' + JSON.stringify(entry.payload);
    process.stdout.write(`[${stamp}] ${lvl.toUpperCase()} ${topic}: ${message}${tail}\n`);
  }
  return entry;
}

/** 记录一条日志；topic 用于过滤，例如 'loop' / 'ai.decide' / 'metronome'。 */
export function log(topic, message, payload) {
  return write('info', topic, message, payload);
}

export const debug = (topic, message, payload) => write('debug', topic, message, payload);
export const info = (topic, message, payload) => write('info', topic, message, payload);
export const warn = (topic, message, payload) => write('warn', topic, message, payload);
export const error = (topic, message, payload) => write('error', topic, message, payload);

/** 最近日志（新的在后），可按 topic / level 过滤。 */
export function recent(limit = 100, filter = {}) {
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, capacity) : 100;
  let rows = buffer;
  if (typeof filter.topic === 'string' && filter.topic !== '') {
    rows = rows.filter((e) => e.topic.startsWith(filter.topic));
  }
  if (typeof filter.level === 'string' && filter.level !== '') {
    rows = rows.filter((e) => e.level === filter.level);
  }
  return rows.slice(-n).map((e) => ({ ...e }));
}

/** 日志统计（按级别计数 + 容量 + 当前级别）。 */
export function stats() {
  return { level: Object.keys(LEVELS).find((k) => LEVELS[k] === level) ?? 'custom', capacity, size: buffer.length, counters: { ...counters } };
}

/** 调整级别 / 容量；测试与运维用。 */
export function configure(opts = {}) {
  if (typeof opts.level === 'string' && LEVELS[opts.level] !== undefined) level = LEVELS[opts.level];
  if (Number.isInteger(opts.capacity) && opts.capacity > 0) {
    capacity = opts.capacity;
    if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity);
  }
  return stats();
}

/** 清空缓冲与计数，并把级别/容量复位到环境默认（测试用）。 */
export function __reset() {
  buffer.length = 0;
  counters.debug = 0; counters.info = 0; counters.warn = 0; counters.error = 0;
  level = LEVELS[process.env.LINYI_LOG_LEVEL] ?? LEVELS.info;
  capacity = DEFAULT_CAPACITY;
}
