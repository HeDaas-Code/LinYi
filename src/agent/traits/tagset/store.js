/**
 * truman-town.agent.traits.tagset.store — 特质存储 / Tag Store
 *
 * 读写单个智能体的 50 个特质标签。以 graph store 作为持久化基座：每个
 * 智能体对应一个 type=traits.tagset 的图节点，data.tags 为标签数组
 * [{ key, weight }]。get 带按写代数的读缓存（首次深拷贝、命中返回同一只读快照），
 * upsert 返回深拷贝。
 */

import * as graph from '../../../infra/store/graph.js';

/** 每个智能体的标准特质标签数量（50 标签设定）。 */
export const TAG_COUNT = 50;

const TYPE = 'traits.tagset';
const PREFIX = 'traits:tagset:';
const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;

/** 写代数：每次 upsert / __reset 自增，供上层派生缓存（如 personality.profile）做失效。 */
let writeCount = 0;

/** get 读缓存：agentId → { agentId, tags } | null；upsert 按 agent 逐条失效，graph 复位整体失效。 */
const readCache = new Map();
let readCacheGraphGen = -1;

function ensureReadCacheFresh() {
  const gg = graph.__generation();
  if (gg !== readCacheGraphGen) {
    readCache.clear();
    readCacheGraphGen = gg;
  }
}

/** 浅拷贝扁平标签数组（{key,weight}），隔离调用方改动且比 structuredClone 更快。 */
function cloneTags(tags) {
  const out = new Array(tags.length);
  for (let i = 0; i < tags.length; i += 1) {
    out[i] = { key: tags[i].key, weight: tags[i].weight };
  }
  return out;
}

function nodeId(agentId) {
  return PREFIX + agentId;
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('tagset.store: agentId 必须为非空字符串');
  }
}

function normalizeTag(tag) {
  if (tag === null || typeof tag !== 'object' || Array.isArray(tag)) {
    throw new TypeError('tagset.store: 每个 tag 必须为 { key, weight } 对象');
  }
  if (typeof tag.key !== 'string' || !KEY_RE.test(tag.key)) {
    throw new TypeError(`tagset.store: 非法 tag.key "${String(tag.key)}"（须匹配 ${KEY_RE}）`);
  }
  if (typeof tag.weight !== 'number' || !Number.isFinite(tag.weight) || tag.weight <= 0) {
    throw new TypeError(`tagset.store: tag "${tag.key}" 的 weight 必须为正有限数`);
  }
  return { key: tag.key, weight: tag.weight };
}

/**
 * 将标签输入规范化并去重（同 key 取后出现的值），按 key 排序。
 * 支持数组（[{key,weight}] 或 [key,weight]）与对象（{key: weight}）两种输入。
 */
function normalizeTags(tags) {
  const map = new Map();
  if (Array.isArray(tags)) {
    for (const item of tags) {
      if (Array.isArray(item)) {
        if (item.length !== 2) {
          throw new TypeError('tagset.store: [key, weight] 二元组长度必须为 2');
        }
        map.set(item[0], item[1]);
      } else {
        const tag = normalizeTag(item);
        map.set(tag.key, tag.weight);
      }
    }
  } else if (tags !== null && typeof tags === 'object') {
    for (const [key, weight] of Object.entries(tags)) {
      map.set(key, weight);
    }
  } else {
    throw new TypeError('tagset.store: tags 必须为数组或对象');
  }

  const out = [];
  for (const [key, weight] of map) {
    out.push(normalizeTag({ key, weight }));
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

/**
 * 读取某智能体的特质标签集。
 * @param {string} agentId
 * @returns {{ agentId: string, tags: Array<{ key: string, weight: number }> } | null}
 */
export function get(agentId) {
  assertAgentId(agentId);
  ensureReadCacheFresh();
  if (readCache.has(agentId)) {
    const cached = readCache.get(agentId);
    return cached === null ? null : { agentId, tags: cloneTags(cached.tags) };
  }
  const node = graph.read(nodeId(agentId));
  if (node === null || node.data === undefined) {
    readCache.set(agentId, null);
    return null;
  }
  // graph.read 已深拷贝 node（含 data.tags），缓存该快照；命中时手动浅拷贝扁平
  // {key,weight} 标签数组（normalizeTag 保证结构扁平），既隔离又远快于 structuredClone。
  const rawTags = node.data.tags ?? [];
  readCache.set(agentId, { agentId, tags: rawTags });
  return { agentId, tags: cloneTags(rawTags) };
}

/**
 * 写入（upsert）某智能体的特质标签集。
 * @param {string} agentId
 * @param {Array<{ key: string, weight: number }> | Record<string, number>} tags
 * @returns {{ agentId: string, tags: Array<{ key: string, weight: number }> }}
 */
export function upsert(agentId, tags) {
  assertAgentId(agentId);
  const normalized = normalizeTags(tags);
  graph.write({
    id: nodeId(agentId),
    type: TYPE,
    data: { agentId, tags: normalized },
  });
  writeCount += 1;
  readCache.delete(agentId);
  return { agentId, tags: structuredClone(normalized) };
}

/** 返回当前写代数（每次 upsert / __reset 递增），供派生缓存判断是否失效。 */
export function __writeCount() {
  return writeCount;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  writeCount += 1;
  readCache.clear();
  readCacheGraphGen = -1;
  graph.__reset();
}
