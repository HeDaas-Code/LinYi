/**
 * truman-town.observer.history — 长跑历史统一查询面 / Long-run History Query
 *
 * 长跑里「可查」与「便宜」是矛盾的：把全部日志永久留在图里，查询成本随 tick
 * 线性增长（实测 12 居民 100 tick 让图节点从 3275 涨到 18977）；
 * 直接丢弃旧记录又会让历史不可查、引用悬空。
 *
 * 本模块的答案按日志性质分开（详见 infra.store.hot-log）：
 *
 * - **审计日志**（决策/行为/事件）：记录**一条都不删**。超出热区的旧记录只压缩
 *   载荷——保留 tick/主体/最终决策或动作/理由/关联 id，丢弃
 *   options/context/intent/model/schedule/final/payload。
 *   因此 list() 与 all() 始终是**全量**，条数与「发生过多少次」严格一致。
 * - **工作集**（帖子）：真正淘汰，摘要进归档。
 *
 * 无论哪种，lookup() 都能区分四种状态，引用不会退化成静默 null：
 *   hot（完整）/ compact（摘要）/ archive（已归档）/ evicted（已淘汰）
 *   / unknown（从未存在）。
 */

import * as decisionLog from './recorder/decision-log.js';
import * as actionLog from './recorder/action-log.js';
import * as eventLog from './recorder/event-log.js';
import * as hotLog from '../infra/store/hot-log.js';

/** 日志名 → 模块。 */
const LOGS = Object.freeze([
  ['decision', decisionLog],
  ['action', actionLog],
  ['event', eventLog],
]);

function assertLog(name) {
  const found = LOGS.find(([n]) => n === name);
  if (found === undefined) {
    throw new TypeError('observer.history: 未知日志 ' + String(name) + '（可用：' + LOGS.map(([n]) => n).join('/') + '）');
  }
  return found[1];
}

/** 全部记录（含压缩摘要）——审计历史全量视图。 */
export function all(options = {}) {
  const names = typeof options.log === 'string' ? [options.log] : LOGS.map(([n]) => n);
  const out = [];
  for (const name of names) {
    for (const node of assertLog(name).all()) {
      out.push({ log: name, id: node.id, ...node.data });
    }
  }
  out.sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0) || (a.seq ?? 0) - (b.seq ?? 0));
  return out;
}

/** 最近 N 条（最新在前）。默认覆盖全量，可用 hotOnly 只看载荷完整的部分。 */
export function recent(options = {}) {
  const names = typeof options.log === 'string' ? [options.log] : LOGS.map(([n]) => n);
  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : 50;
  const out = [];
  for (const name of names) {
    for (const node of assertLog(name).recent({ ...options, limit })) {
      out.push({ log: name, id: node.id, ...node.data });
    }
  }
  out.sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0) || (a.seq ?? 0) - (b.seq ?? 0));
  return out.slice(-limit);
}

/** 仅载荷完整的热区记录。 */
export function hot(options = {}) {
  return recent({ ...options, hotOnly: true });
}

/**
 * 已压缩为摘要的记录（审计骨架仍在），可按日志/主体/tick 过滤。
 * 这些记录**仍在 list()/all() 里**，不是被删除的历史。
 */
export function compacted(options = {}) {
  const names = typeof options.log === 'string' ? [options.log] : LOGS.map(([n]) => n);
  const out = [];
  for (const name of names) {
    for (const node of assertLog(name).compacted()) {
      if (typeof options.agentId === 'string' && node.data?.agentId !== options.agentId) continue;
      if (Number.isInteger(options.since) && Number.isInteger(node.data?.tick) && node.data.tick < options.since) continue;
      out.push({ log: name, id: node.id, ...node.data });
    }
  }
  return out;
}

/** 归档摘要（仅 evict 模式的工作集，如帖子）。 */
export function archived(options = {}) {
  const names = typeof options.log === 'string' ? [options.log] : LOGS.map(([n]) => n);
  const out = [];
  for (const name of names) {
    for (const rec of assertLog(name).archived()) {
      if (typeof options.agentId === 'string' && rec.agentId !== options.agentId) continue;
      if (Number.isInteger(options.since) && Number.isInteger(rec.tick) && rec.tick < options.since) continue;
      out.push({ log: name, ...rec });
    }
  }
  return out;
}

/**
 * 解析一个引用 id：先按 [log].[seq] 前缀判断属于哪条日志，再交给该日志解析。
 * @param {string} id
 * @returns {{found: boolean, source: string, verbosity?: string, id: string, log?: string, record?: object}}
 */
export function lookup(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('observer.history.lookup: id 必须为非空字符串');
  }
  const i = id.indexOf('.');
  if (i > 0) {
    const name = id.slice(0, i);
    if (LOGS.some(([n]) => n === name)) {
      return { ...assertLog(name).lookup(id), log: name };
    }
  }
  for (const [name, mod] of LOGS) {
    const r = mod.lookup(id);
    if (r.source !== 'unknown') return { ...r, log: name };
  }
  return { found: false, source: 'unknown', id };
}

/**
 * 按主体聚合检索：返回该主体在**全量记录 + 归档**中的可查历史。
 * @param {string} agentId
 * @param {{log?: string, since?: number, limit?: number}} [options]
 */
export function byAgent(agentId, options = {}) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('observer.history.byAgent: agentId 必须为非空字符串');
  }
  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : 100;
  const full = all({ ...options, agentId }).filter((r) => r.agentId === agentId);
  const inHot = new Set(hot({ ...options, agentId, limit }).map((r) => r.id));
  return {
    agentId,
    hot: full.filter((r) => inHot.has(r.id)),
    compacted: full.filter((r) => r.__compacted === true),
    archived: archived({ ...options, agentId }),
    coverage: {
      total: full.length,
      hot: inHot.size,
      earliestTick: full.length > 0 ? full[0].tick : null,
      latestTick: full.length > 0 ? full[full.length - 1].tick : null,
    },
  };
}

/** 各日志的有界统计。 */
export function stats() {
  const out = {};
  for (const [name, mod] of LOGS) out[name] = mod.stats();
  return out;
}

/**
 * 上限是否全部生效——把「策略」变成可断言的事实。
 *
 * 审计日志默认处于**保真模式**（hotLimit 为 null）：不压缩，故只断言
 * 「没有任何记录被压缩」——条数不允许被上限削减。
 * 显式配置了上限的日志才断言热区有界。
 * 工作集（evict）额外断言归档有界。
 * @returns {{ok: boolean, violations: Array<{log: string, field: string, value: number, limit: number}>}}
 */
export function assertBounded() {
  const violations = [];
  for (const [name, st] of Object.entries(stats())) {
    // hotLimit === null 表示该日志处于**保真模式**（默认）：不压缩、不淘汰，
    // 因此没有上限可断言——审计日志的完整历史本身就是设计目标。
    if (st.hotLimit === null) {
      if (st.compacted !== 0) violations.push({ log: name, field: 'compacted', value: st.compacted, limit: 0 });
      continue;
    }
    if (st.hot > st.hotLimit) violations.push({ log: name, field: 'hot', value: st.hot, limit: st.hotLimit });
    if (st.mode === 'evict') {
      if (st.total > st.hotLimit) violations.push({ log: name, field: 'total', value: st.total, limit: st.hotLimit });
      if (st.archive > st.archiveLimit) violations.push({ log: name, field: 'archive', value: st.archive, limit: st.archiveLimit });
    }
  }
  return { ok: violations.length === 0, violations };
}

/** 热数据策略的当前形态（供观测 API 与报告引用）。 */
export function policy() {
  return { logs: hotLog.stats(), registered: hotLog.logNames() };
}

