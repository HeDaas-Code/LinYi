/**
 * truman-town.agent.traits.inherit.sampler — 遗传抽样器 / Inheritance Sampler
 *
 * 从父本母本各 50 个 tag 中按比例随机抽取并组合，生成子代标签集。
 * 每个标签 key 在子代中唯一；paternalRatio 控制父本来源占比（默认 0.5）。
 */

import * as rng from '../../../infra/rng.js';
import { TAG_COUNT } from '../tagset/store.js';

function normalizeParent(tags, origin) {
  if (!Array.isArray(tags)) {
    throw new TypeError(`inherit.sampler: ${origin} 标签必须为数组`);
  }
  return tags.map((t) => ({ key: t.key, weight: t.weight, origin }));
}

/** 按权重从候选池中抽取一个标签对象（保留 origin 字段）。 */
function weightedPick(pool) {
  const total = pool.reduce((sum, t) => sum + t.weight, 0);
  if (total <= 0) {
    throw new RangeError('inherit.sampler: 父本/母本权重总和必须为正');
  }
  let r = rng.next() * total;
  for (const tag of pool) {
    if (r < tag.weight) return tag;
    r -= tag.weight;
  }
  return pool[pool.length - 1];
}

/**
 * 组合父本母本标签生成子代。
 * @param {Array<{ key: string, weight: number }>} paternal
 * @param {Array<{ key: string, weight: number }>} maternal
 * @param {{ size?: number, paternalRatio?: number }} [options]
 * @returns {Array<{ key: string, weight: number, source: 'paternal' | 'maternal' }>}
 */
export function combine(paternal, maternal, options = {}) {
  const size = options.size ?? TAG_COUNT;
  const paternalRatio = options.paternalRatio ?? 0.5;
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError('inherit.sampler.combine: size 必须为正整数');
  }
  if (typeof paternalRatio !== 'number' || paternalRatio < 0 || paternalRatio > 1) {
    throw new RangeError('inherit.sampler.combine: paternalRatio 必须在 [0, 1] 之间');
  }

  const paternalPool = normalizeParent(paternal, 'paternal');
  const maternalPool = normalizeParent(maternal, 'maternal');
  const chosen = new Set();
  const result = [];

  const pickFrom = (pool) => {
    const available = pool.filter((t) => !chosen.has(t.key));
    return available.length === 0 ? null : weightedPick(available);
  };

  for (let i = 0; i < size; i += 1) {
    const preferPaternal = rng.next() < paternalRatio;
    let picked = preferPaternal ? pickFrom(paternalPool) : pickFrom(maternalPool);
    let source = preferPaternal ? 'paternal' : 'maternal';
    if (picked === null) {
      const fallbackPool = preferPaternal ? maternalPool : paternalPool;
      picked = pickFrom(fallbackPool);
      source = fallbackPool === maternalPool ? 'maternal' : 'paternal';
    }
    if (picked === null) {
      const leftovers = [...paternalPool, ...maternalPool].filter((t) => !chosen.has(t.key));
      if (leftovers.length === 0) break;
      picked = weightedPick(leftovers);
      source = picked.origin;
    }
    chosen.add(picked.key);
    result.push({ key: picked.key, weight: picked.weight, source });
  }
  return result;
}

/**
 * 统计子代标签来自父本 / 母本 / 共有 / 新变异的计数与比例。
 * @param {Array<{ key: string }>} child
 * @param {Array<{ key: string }>} paternal
 * @param {Array<{ key: string }>} maternal
 */
export function ratio(child, paternal, maternal) {
  const childTags = Array.isArray(child) ? child : [];
  const paternalKeys = new Set((paternal ?? []).map((t) => t.key));
  const maternalKeys = new Set((maternal ?? []).map((t) => t.key));
  let paternalCount = 0;
  let maternalCount = 0;
  let sharedCount = 0;
  let novelCount = 0;
  for (const tag of childTags) {
    const inP = paternalKeys.has(tag.key);
    const inM = maternalKeys.has(tag.key);
    if (inP && inM) sharedCount += 1;
    else if (inP) paternalCount += 1;
    else if (inM) maternalCount += 1;
    else novelCount += 1;
  }
  const total = childTags.length;
  const frac = (n) => (total === 0 ? 0 : n / total);
  const inherited = paternalCount + maternalCount + sharedCount;
  return {
    total,
    paternal: paternalCount,
    maternal: maternalCount,
    shared: sharedCount,
    novel: novelCount,
    inherited,
    inheritedRatio: frac(inherited),
    novelRatio: frac(novelCount),
  };
}

/** 复位随机源（测试用）。 */
export function __reset() {
  rng.__reset();
}
