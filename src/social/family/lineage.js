/**
 * truman-town.social.family.lineage — 血脉谱系 / Family Lineage
 *
 * 追踪家族代际与成员血缘关系。以 graph store 持久化谱系节点（agentId →
 * parents/children/generation/familyId），支持 trace（追谱）与 generation（按代分族）。
 */

import * as graph from '../../infra/store/graph.js';

const TYPE = 'social.family.lineage';
const PREFIX = 'lineage:';

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('lineage: ' + label + ' 必须为非空字符串');
  }
}

/**
 * 登记一条谱系（辅助方法）：记录某智能体的父母与代际，并反写父代的 children。
 * @param {{ agentId: string, familyId?: string|null, parents?: string[], generation?: number }} input
 */
export function register({ agentId, familyId = null, parents = [], generation = 0 } = {}) {
  assertId(agentId, 'agentId');
  const node = { agentId, familyId, parents: [...parents], generation, children: [] };
  graph.write({ id: PREFIX + agentId, type: TYPE, data: node });
  for (const parent of parents) {
    const pn = graph.read(PREFIX + parent);
    if (pn && pn.data) {
      const children = new Set(pn.data.children ?? []);
      children.add(agentId);
      graph.write({ id: PREFIX + parent, type: TYPE, data: { ...pn.data, children: [...children] } });
    }
  }
  return structuredClone(node);
}

/**
 * 追踪某智能体的谱系（父母/祖先/子女/代际/家族）。
 * @param {{ agentId: string }} input
 * @returns {object|null}
 */
export function trace({ agentId } = {}) {
  assertId(agentId, 'agentId');
  const node = graph.read(PREFIX + agentId);
  if (!node || !node.data) return null;
  const ancestors = [];
  const queue = [...(node.data.parents ?? [])];
  const visited = new Set();
  while (queue.length > 0) {
    const pid = queue.shift();
    if (visited.has(pid)) continue;
    visited.add(pid);
    ancestors.push(pid);
    const pn = graph.read(PREFIX + pid);
    if (pn && pn.data && Array.isArray(pn.data.parents)) queue.push(...pn.data.parents);
  }
  return {
    agentId,
    familyId: node.data.familyId,
    parents: [...(node.data.parents ?? [])],
    children: [...(node.data.children ?? [])],
    ancestors,
    generation: node.data.generation ?? 0,
  };
}

/**
 * 按代际列出某家族成员。
 * @param {{ familyId: string }} input
 * @returns {Record<string, string[]>} 代际序号 → 成员 agentId 列表
 */
export function generation({ familyId } = {}) {
  assertId(familyId, 'familyId');
  const all = graph.read({ type: TYPE });
  const groups = {};
  for (const node of all) {
    if (node.data && node.data.familyId === familyId) {
      const g = node.data.generation ?? 0;
      (groups[g] = groups[g] ?? []).push(node.data.agentId);
    }
  }
  return groups;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
