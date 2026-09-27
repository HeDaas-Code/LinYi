/**
 * truman-town.observer.recorder.event-log — 事件日志
 *
 * 记录世界事件（天气、突发事件、生存事件等），并接入事件总线：
 * record() 显式记录单条事件，attach() 订阅总线自动记录全部事件。
 * 事件日志同样写入图存储为不可变追加日志。
 */

import * as graph from '../../infra/store/graph.js';
import * as pubsub from '../../infra/events/pubsub.js';
import { nextSeq } from './_shared.js';
import * as hotLog from '../../infra/store/hot-log.js';

/** 本日志在热数据清单中的名字。 */
const NAME = 'event';
/** 归档摘要上限。 */
const ARCHIVE_LIMIT = 4000;

/** 事件日志在 graph store 中的节点类型。 */
export const TYPE = 'observer.event';

function assertTick(tick) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('event-log.record: tick 必须为非负整数');
  }
}

/**
 * 记录一条世界事件日志。
 * @param {object} input
 * @param {number} input.tick 事件发生的 tick
 * @param {string} input.topic 事件主题
 * @param {unknown} [input.payload] 事件载荷（可结构化克隆）
 * @param {string} [input.agentId] 关联主体 ID（可选）
 * @returns {object} 已写入的日志节点快照
 */
export function record(input) {
  const { tick, topic, payload, agentId } = input ?? {};
  assertTick(tick);
  if (typeof topic !== 'string' || topic.trim() === '') {
    throw new TypeError('event-log.record: topic 必须为非空字符串');
  }
  const seq = nextSeq();
  const node = graph.write({
    id: `obs.event.${seq}`,
    type: TYPE,
    data: {
      tick,
      seq,
      ts: Date.now(),
      topic,
      payload: payload === undefined ? null : structuredClone(payload),
      ...(agentId === undefined ? {} : { agentId }),
    },
  });
  // 热数据上限：超出后最旧的事件日志被淘汰并压入归档。
  HOT.note(node.id, node.data);
  return node;
}

/** 读取全部事件日志节点（按写入顺序）。 */
export function list() {
  return graph.read({ type: TYPE });
}

/**
 * 接入事件总线：订阅全部 topic 并自动记录为事件日志。
 * @param {object} [opts]
 * @param {number | ((payload: unknown, meta: object) => number)} [opts.tick=0]
 *   固定 tick 值，或从 (payload, meta) 解析 tick 的函数
 * @param {string} [opts.agentId] 可选：为自动记录的事件统一标注主体
 * @returns {() => void} 取消订阅函数
 */
export function attach(opts = {}) {
  const tickSrc = opts.tick ?? 0;
  const resolveTick = typeof tickSrc === 'function' ? tickSrc : () => tickSrc;
  const agentId = opts.agentId;
  return pubsub.subscribe('*', (payload, meta) => {
    try {
      record({
        tick: resolveTick(payload, meta),
        topic: meta.topic,
        payload,
        ...(agentId === undefined ? {} : { agentId }),
      });
    } catch (err) {
      console.error('[observer.event-log] 自动记录事件失败:', err);
    }
  });
}


// ---- 热数据上限与归档 ----
//
// 追加型日志在长跑下无界增长（实测 12 居民 100 tick：决策 1770 / 行为 1859 /
// 事件 3235 个图节点），且每次 read({type}) 都要遍历全部。这里给热区设上限，
// 被淘汰的记录压缩进归档——**仍然可查**，只是不再占用热区遍历成本。

/**
 * 本日志的热上限实例。
 * hotLimit：图里保留的完整记录条数；archiveLimit：归档摘要条数上限。
 */
const HOT = hotLog.createLog(NAME, {
  type: TYPE,
  archiveLimit: ARCHIVE_LIMIT,
  // 审计日志用 compact 模式：保留事件主题与归属，payload **截断而非丢弃**。
  //
  // 不能直接丢 payload：observer.audit 的事件证据链按 data.payload 取值，
  // 丢掉会让历史事件在审计里变成 payload=null，等于审计内容失真。
  // 这里按 JSON 长度上限截断，既保住「事件内容可读」，又让载荷有界。
  mode: 'compact',
  summarize: (d) => ({
    tick: d.tick, seq: d.seq, ts: d.ts, agentId: d.agentId, topic: d.topic,
    // 保结构压缩：payload 仍可按字段读取，只是长字符串/长数组被截短。
    payload: hotLog.capDeep(d.payload),
  }),
});

/**
 * **全部**记录（含已压缩为摘要的旧记录）——审计历史全量视图。
 * 与 list() 等价，命名更明确：热区上限只压缩载荷，从不减少记录条数。
 */
export function all() {
  return HOT.all();
}

/** 仅载荷完整的近期记录。 */
export function hot() {
  return HOT.hot();
}

/** 已压缩为摘要的记录（仅保留审计骨架）。 */
export function compacted() {
  return HOT.compacted();
}

/** 最近 N 条记录（最新在前，可按主体/主题/起始 tick 过滤；hotOnly 只取热区）。 */
export function recent(options = {}) {
  return HOT.recent(options);
}

/**
 * 按 id 解析引用，返回四态：
 *   hot（在热区，含完整记录）/ archive（已归档，含摘要）
 *   / evicted（曾经存在、摘要也已淘汰）/ unknown（从未存在）。
 * 调用方据此可区分「历史被裁剪」与「引用本就无效」，不会把两者混为一谈。
 */
export function lookup(id) {
  return HOT.lookup(id);
}

/** 归档摘要（插入序 = 淘汰序）。 */
export function archived() {
  return HOT.archived();
}

/** 有界统计：热/归档条数、淘汰与丢弃计数、tick 覆盖范围、按主题与主体聚合。 */
export function stats() {
  return HOT.stats();
}

/** 清空归档（测试用；图由 graph.__reset 负责）。 */
export function __reset() {
  HOT.__reset();
}
