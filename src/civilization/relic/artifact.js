/**
 * truman-town.civilization.relic.artifact — 遗物 / Relic Artifacts
 *
 * 用户需求原文（t14）：实现 relic artifact/discover 与**知识来源链**。
 *
 * 遗物是上一代文明留在世界里的**物证**：一台锈蚀的净水机、一本烧掉半边的笔记、
 * 一把卷刃的斧头。它不是"遗产摘要"，而是可以被**后来的人捡到、读到、读错**的东西。
 * 这三分区别是本模块存在的理由：
 *
 * - **有来源**：每件遗物记住它出自哪一代文明、哪张遗产图谱、哪一项成就/事件
 *   （sourceCivilizationId / sourceGraphId / sourceDeed）。凭空生成的"遗产"无法追溯。
 * - **可误解**：遗物上刻的内容（inscribed）是**可能失真**的（integrity < 1），
 *   后来者读到的未必是原意。解读发生在 discover 阶段，不在本模块。
 * - **可丢失**：遗物是物理对象，可以被丢弃、被消耗、被埋掉；本模块提供 remove，
 *   且遗物数量有上限（不会因为世代叠加而无界增长）。
 *
 * 设计取舍：遗物**不是**技术本身。捡到一台净水机不等于会造净水机——
 * 中间必须经过"解读 → 学到/学歪 → 成为技能或研究前提或行动偏好"这条链
 *（见 legacy/inherit/*）。把遗物直接当成技术解锁，是把知识继承退化成发奖。
 */

import * as graphStore from '../../infra/store/graph.js';
import * as identity from '../../infra/identity.js';
import * as eventLog from '../../observer/recorder/event-log.js';

/** 遗物在 graph store 中的节点类型。 */
export const TYPE = 'civilization.relic';

/**
 * 遗物种类目录：由**上一代的真实成就**映射而来。
 *
 * deed 是 legacy.graph 里 deeds 节点的 action 名（forage/craft/build/write/work...）。
 * 每类遗物刻着一种**可能被继承的知识**（claim），但 claim 只是"刻上去的内容"，
 * 是否为真、能否被正确解读，由下游的解读与校验决定。
 */
export const RELIC_KINDS = Object.freeze({
  machine: Object.freeze({
    title: '机械残骸',
    fromDeeds: Object.freeze(['craft', 'craft:axe']),
    claim: Object.freeze({ type: 'skill', key: 'metalwork' }),
  }),
  notes: Object.freeze({
    title: '残缺笔记',
    fromDeeds: Object.freeze(['write', 'write_book']),
    claim: Object.freeze({ type: 'skill', key: 'reading' }),
  }),
  ledger: Object.freeze({
    title: '账本',
    fromDeeds: Object.freeze(['trade']),
    claim: Object.freeze({ type: 'preference', key: 'trade', bias: 0.35 }),
  }),
  seeds: Object.freeze({
    title: '种子罐',
    fromDeeds: Object.freeze(['forage']),
    claim: Object.freeze({ type: 'preference', key: 'forage', bias: 0.3 }),
  }),
  blueprint: Object.freeze({
    title: '蓝图',
    fromDeeds: Object.freeze(['build', 'build:barn']),
    claim: Object.freeze({ type: 'tech', key: 'water_purification' }),
  }),
  remedy: Object.freeze({
    title: '药方',
    fromDeeds: Object.freeze(['treatment']),
    claim: Object.freeze({ type: 'tech', key: 'greenhouse' }),
  }),
});

/** 单代遗物上限：遗物是**有界**的工作集，不是无界日志。 */
const MAX_RELICS = 48;

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('relic: ' + label + ' 必须为非空字符串');
  }
}

/** 确定性哈希（不消耗全局 rng：遗物的生成不能扰动主随机流）。 */
function hash01(...parts) {
  let h = 2166136261 >>> 0;
  const s = parts.map((p) => String(p)).join('|');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 8) / 16777216;
}

/**
 * 由一份遗产（legacy.graph 快照）铸造遗物。
 *
 * 只有**真实发生过的成就**才会留下遗物：deeds 里出现过的行动才有对应种类。
 * 因此"上一代没做过的事"不会凭空变成遗产——这是来源可追溯的第一层保证。
 *
 * @param {{ legacy?: object, civilizationId?: string, tick?: number, limit?: number }} [input]
 * @returns {{ relics: Array<object>, civilizationId: string, graphId: string|null, skipped: string[] }}
 */
export function forge(input = {}) {
  const legacy = input.legacy ?? {};
  const graph = legacy.graph ?? null;
  const civilizationId = typeof input.civilizationId === 'string' && input.civilizationId !== ''
    ? input.civilizationId
    : (graph?.civilizationId ?? 'unknown');
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const limit = Number.isInteger(input.limit) && input.limit > 0 ? input.limit : MAX_RELICS;

  const deedCounts = new Map();
  for (const n of (Array.isArray(graph?.nodes) ? graph.nodes : [])) {
    if (n?.kind !== 'deed') continue;
    deedCounts.set(String(n.label), Number(n.meta?.count) || 0);
  }

  const relics = [];
  const skipped = [];
  for (const [kind, spec] of Object.entries(RELIC_KINDS)) {
    const hits = spec.fromDeeds.filter((d) => (deedCounts.get(d) ?? 0) > 0);
    if (hits.length === 0) { skipped.push(kind); continue; }
    const total = hits.reduce((s, d) => s + (deedCounts.get(d) ?? 0), 0);
    // 遗物的**完整度**由成就的规模决定（做得越多，留下的东西越完整），
    // 但它永远 < 1：任何物证都在时间里损失了一部分。这个 0.55~0.95 的区间
    // 就是后面"可误解"的概率来源——完整度越低，越容易读歪。
    const integrity = 0.55 + 0.4 * (1 - Math.exp(-total / 12));
    const relicId = identity.next('relic');
    relics.push({
      relicId,
      kind,
      title: spec.title,
      // ---- 来源链（可追溯）----
      sourceCivilizationId: civilizationId,
      sourceGraphId: graph?.graphId ?? null,
      sourceDeeds: hits.map((d) => ({ action: d, count: deedCounts.get(d) ?? 0 })),
      forgedAtTick: tick,
      integrity,
      // ---- 刻上去的内容（可能被读歪）----
      inscribed: { ...spec.claim },
    });
    if (relics.length >= limit) break;
  }

  for (const r of relics) {
    graphStore.write({ id: 'relic:' + r.relicId, type: TYPE, data: r });
  }
  if (relics.length > 0) {
    eventLog.record({
      tick,
      topic: 'civilization.relic.forged',
      payload: {
        civilizationId,
        graphId: graph?.graphId ?? null,
        relics: relics.map((r) => ({ relicId: r.relicId, kind: r.kind, integrity: Number(r.integrity.toFixed(3)) })),
        skipped,
      },
    });
  }
  return { relics, civilizationId, graphId: graph?.graphId ?? null, skipped };
}

/**
 * 查询遗物。
 * - query()                  → 全部遗物
 * - query({ relicId })       → 单件或 null
 * - query({ civilizationId })→ 该文明留下的遗物
 * - query({ discovered })    → 是否已被解读（discovered 由 discover 模块写回）
 */
export function query(q) {
  const all = graphStore.read({ type: TYPE }).map((n) => n.data);
  if (q === undefined || q === null) return all;
  if (typeof q === 'string') {
    const hit = all.find((r) => r?.relicId === q);
    return hit ?? null;
  }
  if (typeof q?.relicId === 'string') {
    const hit = all.find((r) => r?.relicId === q.relicId);
    return hit ?? null;
  }
  let out = all;
  if (typeof q?.civilizationId === 'string') out = out.filter((r) => r.civilizationId === q.civilizationId
    || r.sourceCivilizationId === q.civilizationId);
  if (typeof q?.kind === 'string') out = out.filter((r) => r.kind === q.kind);
  if (q?.discovered === true) out = out.filter((r) => typeof r.discoveredBy === 'string' && r.discoveredBy !== '');
  if (q?.discovered === false) out = out.filter((r) => typeof r.discoveredBy !== 'string' || r.discoveredBy === '');
  return out;
}

/** 标记遗物已被某人解读（由 discover 调用，写回来源链的下一环）。 */
export function markDiscovered({ relicId, agentId, tick = 0, fidelity = 'faithful' } = {}) {
  assertId(relicId, 'relicId');
  assertId(agentId, 'agentId');
  const rec = query({ relicId });
  if (rec === null) return null;
  const next = {
    ...rec,
    discoveredBy: agentId,
    discoveredAtTick: Number.isInteger(tick) ? tick : 0,
    discoveryFidelity: fidelity,
  };
  graphStore.write({ id: 'relic:' + relicId, type: TYPE, data: next });
  return next;
}

/**
 * 丢弃一件遗物（可丢失）。遗物是物证，不是账本条目——它可以被消耗、遗失、掩埋。
 * @param {{ relicId: string }} input
 * @returns {boolean} 是否真的移除
 */
export function remove({ relicId } = {}) {
  assertId(relicId, 'relicId');
  const rec = query({ relicId });
  if (rec === null) return false;
  graphStore.remove('relic:' + relicId);
  return true;
}

/** 遗物统计（供观测与验收）。 */
export function stats() {
  const all = query();
  const byKind = {};
  for (const r of all) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const discovered = all.filter((r) => typeof r.discoveredBy === 'string' && r.discoveredBy !== '');
  return {
    total: all.length,
    byKind,
    discovered: discovered.length,
    undiscovered: all.length - discovered.length,
    garbled: all.filter((r) => r.discoveryFidelity === 'garbled').length,
    meanIntegrity: all.length === 0 ? 0
      : all.reduce((s, r) => s + (Number(r.integrity) || 0), 0) / all.length,
  };
}

/** 复位（测试用；图由上层 graph.__reset 负责）。 */
export function __reset() { /* 无自有内存状态：遗物全部落在 graph store */ }
