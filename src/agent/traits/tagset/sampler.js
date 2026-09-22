/**
 * truman-town.agent.traits.tagset.sampler — 特质采样 / Tag Sampler
 *
 * 按权重随机采样特质标签。weighted 采用无放回加权抽取；sample 从某智能体
 * 的标签集抽取单个标签。随机源来自 infra.rng，可 seed 复现。
 */

import * as rng from '../../../infra/rng.js';
import * as store from './store.js';

/**
 * 按权重无放回抽取 n 个标签（默认 1 个）。
 * @template {{ key: string, weight: number }} T
 * @param {T[]} tags
 * @param {number} [n=1]
 * @returns {T[]}
 */
export function weighted(tags, n = 1) {
  if (!Array.isArray(tags)) {
    throw new TypeError('tagset.sampler.weighted: tags 必须为数组');
  }
  const count = Math.floor(n);
  if (!Number.isFinite(count) || count < 0) {
    throw new RangeError('tagset.sampler.weighted: n 必须为非负整数');
  }
  if (count > tags.length) {
    throw new RangeError(`tagset.sampler.weighted: 请求 ${count} 个，但只有 ${tags.length} 个标签`);
  }

  const pool = tags.map((t) => ({ key: t.key, weight: t.weight }));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const total = pool.reduce((sum, t) => sum + t.weight, 0);
    if (total <= 0) {
      throw new RangeError('tagset.sampler.weighted: 权重总和必须为正');
    }
    let r = rng.next() * total;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j += 1) {
      if (r < pool[j].weight) {
        idx = j;
        break;
      }
      r -= pool[j].weight;
    }
    out.push({ key: pool[idx].key, weight: pool[idx].weight });
    pool.splice(idx, 1);
  }
  return out;
}

/**
 * 从智能体标签集中按权重抽取 1 个标签；无标签返回 null。
 * @param {string} agentId
 * @returns {{ key: string, weight: number } | null}
 */
export function sample(agentId) {
  const tagset = store.get(agentId);
  if (tagset === null || tagset.tags.length === 0) return null;
  return weighted(tagset.tags, 1)[0];
}

/** 复位随机源与标签存储（测试用）。 */
export function __reset() {
  rng.__reset();
  store.__reset();
}
