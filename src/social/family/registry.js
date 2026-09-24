/**
 * truman-town.social.family.registry — 家族登记 / Family Registry
 *
 * 家族实体（名称、创立者、成员、代际）的创建、查找与解散。持久化在 graph store
 *（type=social.family）。lookup 支持按 familyId / 成员 / 名称查询。本模块是 lineage
 *（血脉谱系）的上层组织：lineage 记录父子女与代际，registry 记录家族实体与成员名册。
 */

import * as graph from '../../infra/store/graph.js';
import * as identity from '../../infra/identity.js';

const TYPE = 'social.family';
const PREFIX = 'family:';

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('family.registry: ' + label + ' 必须为非空字符串');
  }
}

function assertName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('family.registry: name 必须为非空字符串');
  }
}

function nodeId(familyId) {
  return PREFIX + familyId;
}

function clone(v) {
  return v === undefined ? undefined : structuredClone(v);
}

function normalizeGeneration(gen) {
  const out = {};
  if (gen === null || typeof gen !== 'object' || Array.isArray(gen)) return out;
  for (const [k, v] of Object.entries(gen)) {
    const n = Number(k);
    if (Number.isInteger(n) && n >= 0 && Array.isArray(v)) out[n] = [...new Set(v.map(String))];
  }
  return out;
}

/** 创建家族：调用 social.family.registry.create。 */
export function create({ name, founder, members = [], generation = {}, tick = 0 } = {}) {
  assertName(name);
  assertId(founder, 'founder');
  const familyId = identity.next('family');
  const memberList = [...new Set([founder, ...(Array.isArray(members) ? members.map(String) : [])])];
  const entity = {
    familyId,
    name,
    founder,
    members: memberList,
    generation: normalizeGeneration(generation),
    createdAt: typeof tick === 'number' ? tick : 0,
    dissolvedAt: null,
    status: 'active',
  };
  graph.write({ id: nodeId(familyId), type: TYPE, data: entity });
  return clone(entity);
}

/** 查找家族：调用 social.family.registry.lookup（按 familyId / 成员 / 名称）。 */
export function lookup(input = {}) {
  const all = graph.read({ type: TYPE }).map((n) => clone(n.data)).filter((f) => f && f.status === 'active');
  if (input === null || typeof input !== 'object') return all;
  if (typeof input.familyId === 'string') return all.find((f) => f.familyId === input.familyId) ?? null;
  if (typeof input.memberId === 'string') return all.filter((f) => f.members.includes(input.memberId));
  if (typeof input.name === 'string') return all.find((f) => f.name === input.name) ?? null;
  return all;
}

/** 解散家族：调用 social.family.registry.dissolve（软解散，标记 dissolvedAt）。 */
export function dissolve({ familyId, tick = 0 } = {}) {
  assertId(familyId, 'familyId');
  const node = graph.read(nodeId(familyId));
  if (node === null || !node.data) throw new Error('family.registry.dissolve: 家族不存在');
  const entity = { ...node.data, status: 'dissolved', dissolvedAt: typeof tick === 'number' ? tick : 0 };
  graph.write({ id: nodeId(familyId), type: TYPE, data: entity });
  return clone(entity);
}

/** 追加成员（辅助）：向家族添加成员并登记代际。 */
export function addMember({ familyId, memberId, generation = 0 } = {}) {
  assertId(familyId, 'familyId');
  assertId(memberId, 'memberId');
  const node = graph.read(nodeId(familyId));
  if (node === null || !node.data) throw new Error('family.registry.addMember: 家族不存在');
  const entity = { ...node.data };
  if (!entity.members.includes(memberId)) entity.members.push(memberId);
  const g = Number(generation);
  if (!entity.generation[g]) entity.generation[g] = [];
  if (!entity.generation[g].includes(memberId)) entity.generation[g].push(memberId);
  graph.write({ id: nodeId(familyId), type: TYPE, data: entity });
  return clone(entity);
}

/** 列出全部活跃家族（辅助）。 */
export function list() {
  return graph.read({ type: TYPE }).map((n) => clone(n.data)).filter((f) => f && f.status === 'active');
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}

