/**
 * truman-town.observer.recorder.action-log — 行为日志
 *
 * 记录每一个智能体行为：谁在哪个 tick 执行了什么动作、结果如何。
 * 与决策日志分离存储，便于区分"决定做什么"与"实际做了什么"，
 * 同样写入图存储为不可变追加日志。
 */

import * as graph from '../../infra/store/graph.js';
import { nextSeq } from './_shared.js';
import * as hotLog from '../../infra/store/hot-log.js';

/** 本日志在热数据清单中的名字。 */
const NAME = 'action';
/** 归档摘要上限。 */
const ARCHIVE_LIMIT = 4000;

/** 行为日志在 graph store 中的节点类型。 */
export const TYPE = 'observer.action';

function assertTick(tick) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('action-log.record: tick 必须为非负整数');
  }
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('action-log.record: agentId 必须为非空字符串');
  }
}

/**
 * 记录一条行为日志。
 * @param {object} input
 * @param {number} input.tick 行为发生的 tick
 * @param {string} input.agentId 行为主体 ID
 * @param {unknown} input.action 行为描述
 * @param {unknown} [input.outcome] 行为结果
 * @param {string} [input.actionId] 行为 ID（可选）
 * @param {string} [input.decisionId] 关联的决策 ID（可选；与 decision-log 的 decisionId 对应）
 * @returns {object} 已写入的日志节点快照
 */
export function record(input) {
  const { tick, agentId, action, outcome, actionId, decisionId } = input ?? {};
  assertTick(tick);
  assertAgentId(agentId);
  if (action === undefined) {
    throw new TypeError('action-log.record: action 不能为空');
  }
  const seq = nextSeq();
  const node = graph.write({
    id: `obs.action.${seq}`,
    type: TYPE,
    data: {
      tick,
      seq,
      ts: Date.now(),
      agentId,
      action: structuredClone(action),
      ...(outcome === undefined ? {} : { outcome: structuredClone(outcome) }),
      ...(actionId === undefined ? {} : { actionId }),
      // D01：执行日志带同一个 decisionId，使「意图 → 执行 → 结果」可用一个 ID 串起来。
      ...(decisionId === undefined ? {} : { decisionId }),
    },
  });
  // 热数据上限：超出后最旧的行为日志被淘汰并压入归档。
  HOT.note(node.id, node.data);
  return node;
}

/** 读取全部行为日志节点（按写入顺序）。 */
export function list() {
  return graph.read({ type: TYPE });
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
  // 审计日志用 compact 模式：保留「谁在何时做了什么、关联哪个决策」，丢弃 outcome 载荷。
  mode: 'compact',
  // 保结构压缩：**必须保留 outcome**（applied/started/planned/noop/failed 是执行证据，
  // 丢了它「空操作不得记成功」的审计链就断了），只压长度。
  summarize: (d) => ({
    tick: d.tick, seq: d.seq, ts: d.ts, agentId: d.agentId,
    actionId: d.actionId, decisionId: d.decisionId,
    action: hotLog.capDeep(d.action, { maxDepth: 3 }),
    outcome: hotLog.capDeep(d.outcome, { maxDepth: 3 }),
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
