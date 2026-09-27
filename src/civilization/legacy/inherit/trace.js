/**
 * truman-town.civilization.legacy.inherit.trace — 知识来源链 / Knowledge Provenance Trace
 *
 * 用户需求原文（t14）：「遗产必须转为**有来源**的…」。
 * "有来源"必须是**可查询的**，否则只是一句声明。本模块把整条链一次走通：
 *
 *   agent → 技能/研究前提/偏好 → discovery → relic → legacy graph → 上一代文明
 *
 * 同时也提供**校验**（verify）：任何一环断掉（技能没有来源、来源指向不存在的遗物、
 * 遗物没有图谱出处）都会被指出来。断链的继承就是"凭空发奖"，本任务要杜绝的正是它。
 */

import * as graphStore from '../../../infra/store/graph.js';
import * as skill from './skill.js';
import * as preference from './preference.js';
import * as applier from './applier.js';
import * as artifact from '../../relic/artifact.js';

/**
 * 追一个居民的继承来源链。
 * @param {string} agentId
 * @returns {{ agentId: string, skills: Array<object>, preferences: Array<object>,
 *             headStarts: Array<object>, chain: Array<object>, broken: Array<object> }}
 */
export function of(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('trace.of: agentId 必须为非空字符串');
  }
  const skills = skill.of(agentId).map((s) => ({ kind: 'skill', key: s.skillId, source: s.source }));
  const prefs = preference.of(agentId).map((p) => ({
    kind: 'preference', key: p.action, bias: p.bias, sources: p.sources,
  }));
  const heads = applier.headStartsOf(agentId).map((h) => ({ kind: 'tech_headstart', key: h.techId, source: h.source }));

  const chain = [];
  const broken = [];
  for (const item of [...skills, ...prefs, ...heads]) {
    const sources = item.sources ?? (item.source === null || item.source === undefined ? [] : [item.source]);
    if (sources.length === 0) {
      broken.push({ ...item, reason: 'missing_source' });
      continue;
    }
    for (const src of sources) {
      const relic = typeof src?.relicId === 'string' ? artifact.query({ relicId: src.relicId }) : null;
      const link = {
        agentId,
        capability: { kind: item.kind, key: item.key },
        discoveryId: src?.discoveryId ?? null,
        relicId: src?.relicId ?? null,
        relicFound: relic !== null,
        sourceGraphId: src?.sourceGraphId ?? null,
        sourceCivilizationId: src?.sourceCivilizationId ?? null,
        fidelity: src?.fidelity ?? null,
      };
      chain.push(link);
      if (relic === null) broken.push({ ...link, reason: 'relic_not_found' });
      else if (typeof relic.sourceGraphId !== 'string' || relic.sourceGraphId === '') {
        broken.push({ ...link, reason: 'relic_has_no_graph_source' });
      }
    }
  }
  return { agentId, skills, preferences: prefs, headStarts: heads, chain, broken };
}

/**
 * 校验一批居民的继承链是否完整（供验收与收口使用）。
 * @param {{ agents?: string[] }} [input] 缺省校验全部技能/偏好/研究前提的持有者
 * @returns {{ checked: number, broken: Array<object>, ok: boolean }}
 */
export function verify(input = {}) {
  let agents = Array.isArray(input.agents) ? input.agents.filter((a) => typeof a === 'string') : null;
  if (agents === null) {
    const set = new Set();
    for (const rec of skill.all()) if (rec.skills.length > 0) set.add(rec.agentId);
    for (const rec of preference.all()) if (rec.preferences.length > 0) set.add(rec.agentId);
    for (const h of applier.headStarts()) set.add(h.agentId);
    agents = [...set].sort();
  }
  const broken = [];
  for (const a of agents) {
    const t = of(a);
    for (const b of t.broken) broken.push(b);
  }
  return { checked: agents.length, broken, ok: broken.length === 0 };
}

/**
 * 全量知识来源链快照（供 observer/api 与验收报告）。
 * @returns {{ relics: object, discoveries: object, skills: object, preferences: object, headStarts: number }}
 */
export function summary() {
  const relics = artifact.stats();
  const discoveries = graphStore.read({ type: 'civilization.relic.discovery' }).length;
  return {
    relics,
    discoveries,
    skills: skill.stats(),
    preferences: preference.stats(),
    headStarts: applier.headStarts().length,
  };
}
