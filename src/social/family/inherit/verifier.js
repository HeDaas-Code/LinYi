/**
 * truman-town.social.family.inherit.verifier — 遗传审计器 / Inheritance Verifier
 *
 * 查询与审计家族特质继承记录：某智能体携带了哪些家族特质、以及一批成员的
 * 覆盖情况。只读 tagset，不做持久化。
 */

import * as tagsetStore from '../../../agent/traits/tagset/store.js';

function traitKeys(familyTraits) {
  const out = new Set();
  for (const t of familyTraits ?? []) {
    if (typeof t === 'string') out.add(t);
    else if (t && typeof t.key === 'string') out.add(t.key);
  }
  return out;
}

/**
 * 查询某智能体携带了哪些家族特质。
 * @param {{ agentId: string, familyTraits?: Array }} input
 * @returns {{ agentId: string, carried: string[], missing: string[] }}
 */
export function query({ agentId, familyTraits = [] } = {}) {
  const tagset = tagsetStore.get(agentId);
  const keys = new Set((tagset ? tagset.tags : []).map((t) => t.key));
  const traits = [...traitKeys(familyTraits)];
  const carried = traits.filter((k) => keys.has(k));
  const missing = traits.filter((k) => !keys.has(k));
  return { agentId, carried, missing };
}

/**
 * 审计一批智能体的家族特质继承覆盖情况。
 * @param {{ agentIds?: string[], familyTraits?: Array }} input
 * @returns {{ traits: string[], rows: Array, coverage: Record<string, {carried:number,total:number,ratio:number}> }}
 */
export function audit({ agentIds = [], familyTraits = [] } = {}) {
  const traits = [...traitKeys(familyTraits)];
  const rows = agentIds.map((id) => ({ agentId: id, ...query({ agentId: id, familyTraits: traits }) }));
  const coverage = {};
  for (const t of traits) {
    const count = rows.filter((r) => r.carried.includes(t)).length;
    coverage[t] = { carried: count, total: rows.length, ratio: rows.length === 0 ? 0 : count / rows.length };
  }
  return { traits, rows, coverage };
}

/** 复位底层 tagset 状态（测试用）。 */
export function __reset() {
  tagsetStore.__reset();
}
