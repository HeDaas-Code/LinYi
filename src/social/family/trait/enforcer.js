/**
 * truman-town.social.family.trait.enforcer — 特质固化器 / Trait Enforcer
 *
 * 把检测通过的特质固化为家族特质，并强制不超过 5 个。家族特质以 graph store
 * 持久化（按 familyId 记录），set 超限抛 RangeError，limit 返回上限。
 */

import * as graph from '../../../infra/store/graph.js';

const TYPE = 'social.family.trait';
const PREFIX = 'family.trait:';
const MAX_TRAITS = 5;

function normalizeTraits(traits) {
  return traits.map((t) => {
    if (typeof t === 'string') return { key: t, weight: 1.0 };
    if (t && typeof t.key === 'string') return { key: t.key, weight: t.weight ?? 1.0 };
    throw new TypeError('enforcer.set: 家族特质必须为字符串或含 key 的对象');
  });
}

/**
 * 设置（固化）家族特质，强制不超过 MAX_TRAITS 个。
 * @param {{ familyId: string, traits?: Array<string|{key:string,weight?:number}> }} input
 * @returns {{ familyId: string, traits: Array }}
 */
export function set({ familyId, traits = [] } = {}) {
  if (typeof familyId !== 'string' || familyId.trim() === '') {
    throw new TypeError('enforcer.set: familyId 必须为非空字符串');
  }
  const normalized = normalizeTraits(traits);
  if (normalized.length > MAX_TRAITS) {
    throw new RangeError('enforcer.set: 家族特质最多 ' + MAX_TRAITS + ' 个，实际 ' + normalized.length);
  }
  const node = { familyId, traits: normalized };
  graph.write({ id: PREFIX + familyId, type: TYPE, data: node });
  return structuredClone(node);
}

/** 查询家族特质上限。 */
export function limit() {
  return MAX_TRAITS;
}

/** 查询已固化的家族特质（辅助方法）。 */
export function list(familyId) {
  const node = graph.read(PREFIX + familyId);
  return node && node.data ? structuredClone(node.data.traits) : [];
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
