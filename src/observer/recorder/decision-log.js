/**
 * truman-town.observer.recorder.decision-log — 决策日志
 *
 * 记录每一次智能体决策：谁在哪个 tick、在什么上下文（需求压力/预想）下，
 * 从哪些候选项中选择了什么、理由是什么。写入图存储为不可变追加日志，
 * 每条记录获得全局唯一且有序的 id，供编年编译与审计回溯。
 */

import * as graph from '../../infra/store/graph.js';
import { nextSeq } from './_shared.js';
import * as hotLog from '../../infra/store/hot-log.js';

/** 本日志在热数据清单中的名字。 */
const NAME = 'decision';
/** 归档摘要上限。 */
const ARCHIVE_LIMIT = 4000;

/** 决策日志在 graph store 中的节点类型。 */
export const TYPE = 'observer.decision';

function assertTick(tick) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('decision-log.record: tick 必须为非负整数');
  }
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('decision-log.record: agentId 必须为非空字符串');
  }
}

/**
 * 记录一条决策日志。
 * @param {object} input
 * @param {number} input.tick 决策发生的 tick
 * @param {string} input.agentId 决策者 ID
 * @param {unknown} input.decision 最终选择的决策描述
 * @param {unknown[]} [input.options] 候选选项列表
 * @param {unknown} [input.context] 决策上下文快照
 * @param {string} [input.reason] 决策理由
 * @param {string} [input.decisionId] 决策模块产出的决策 ID（可选）
 * @param {object} [input.intent] 规则选择阶段的结果（被覆盖前的居民本意）
 * @param {object} [input.model] 模型选择阶段的结果（是否生效、回退原因）
 * @param {object} [input.schedule] 日程建议阶段的结果（建议值、是否被采纳）
 * @param {object} [input.final] 最终动作阶段的结果（动作、来源、分数、置信度）
 * @returns {object} 已写入的日志节点快照
 */
export function record(input) {
  const { tick, agentId, decision, options, context, reason, decisionId, intent, model, schedule, final, counterfactual } = input ?? {};
  assertTick(tick);
  assertAgentId(agentId);
  if (decision === undefined) {
    throw new TypeError('decision-log.record: decision 不能为空');
  }
  const seq = nextSeq();
  const node = graph.write({
    id: `obs.decision.${seq}`,
    type: TYPE,
    data: {
      tick,
      seq,
      ts: Date.now(),
      agentId,
      decision: structuredClone(decision),
      ...(options === undefined ? {} : { options: structuredClone(options) }),
      ...(context === undefined ? {} : { context: structuredClone(context) }),
      ...(reason === undefined ? {} : { reason }),
      ...(decisionId === undefined ? {} : { decisionId }),
      // D01：规则选择 / 模型选择 / 日程建议 / 最终行动分成不同阶段记录，
      // 使「被覆盖的动作」不会冒充最终动作，且每个阶段都可独立审计。
      ...(intent === undefined ? {} : { intent: structuredClone(intent) }),
      ...(model === undefined ? {} : { model: structuredClone(model) }),
      ...(schedule === undefined ? {} : { schedule: structuredClone(schedule) }),
      // D01：最终动作单独成阶段——来源（rule/model/schedule）与它自己的分数/置信度。
      // 被覆盖动作的分数不会出现在这里，因此不可能冒充最终动作的分数。
      ...(final === undefined ? {} : { final: structuredClone(final) }),
      // t10：反事实干预标记。record() 是**按字段白名单**写入的（不转发就静默丢弃），
      // 这一点在实现 t10 时真实咬过一次：调用方已经传了 counterfactual，
      // 这里没收，于是分支世界的唯一证据消失了，只能靠 final.source 反推。
      // 分支世界与基线世界逐字段可比，**唯一**的差别就是这里（以及 decision/final）；
      // 不记这一段，就无法区分"干预没生效"与"干预无后果"。
      ...(counterfactual === undefined ? {} : { counterfactual: structuredClone(counterfactual) }),
    },
  });
  // 热数据上限：超出后最旧的决策日志被淘汰并压入归档（见 infra.store.hot-log）。
  HOT.note(node.id, node.data);
  return node;
}

/** 读取全部决策日志节点（按写入顺序）。 */
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
// **默认不设热上限**（保真模式）：决策记录的每个字段都有消费者
// （options/context/intent/model/schedule/final 分别被审计、编年与行为契约测试读取），
// 压缩掉任何字段都会让读取方静默拿到 undefined。
// 需要为超长跑控制内存时，用 hotLog.configureRetention('decision', { hotLimit: N })
// 显式开启，并接受旧记录只保留审计骨架。
const HOT = hotLog.createLog(NAME, {
  type: TYPE,
  archiveLimit: ARCHIVE_LIMIT,
  // 审计日志用 compact 模式：**一条都不删**，只把超出热区的旧记录原地压缩成摘要。
  // 被丢弃的是冗长载荷（options/context/intent/model/schedule/final），
  // 保留的是审计骨架——谁、何时、最终选了什么、为什么。
  mode: 'compact',
  // 保结构压缩：审计要读的字段一个不丢，只压长度。
  //   context  → 深裁（contention.doomedButChosen 等判定字段仍可按路径读到）
  //   options  → 深裁（候选列表保留前若干项）
  //   intent/model/schedule/final → 深裁（阶段证据仍在）
  summarize: (d) => ({
    tick: d.tick, seq: d.seq, ts: d.ts, agentId: d.agentId,
    decisionId: d.decisionId, decision: hotLog.capDeep(d.decision, { maxDepth: 3 }),
    reason: typeof d.reason === 'string' && d.reason.length > 160 ? d.reason.slice(0, 160) + '…' : d.reason,
    options: hotLog.capDeep(d.options),
    context: hotLog.capDeep(d.context),
    intent: hotLog.capDeep(d.intent, { maxDepth: 3 }),
    model: hotLog.capDeep(d.model, { maxDepth: 3 }),
    schedule: hotLog.capDeep(d.schedule, { maxDepth: 3 }),
    final: hotLog.capDeep(d.final, { maxDepth: 3 }),
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
