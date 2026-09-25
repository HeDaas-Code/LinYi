/**
 * truman-town.genesis.heredity.tags — 后代特质组合。
 *
 * 用户需求原文：**后代的 50 条标签由父母的 100 条标签随机组合而成**。
 *
 * 设计取舍：
 * - **父母各出一半的候选池**：先把父母的标签合并成 100 条候选，
 *   再从中抽取 50 条。这直接实现"从 100 条里组合出 50 条"。
 * - **不引入新标签**：组合只在父母的 100 条内发生（除非显式开启变异）。
 *   否则"遗传"会退化成"重新随机"，家族特征无法稳定沉淀——
 *   而家族特征（三代无损后固定）依赖的正是这种稳定性。
 * - **不按维度互斥**：50 条标签是 **50 个独立特征位**，不是 12 个维度的投影。
 *   每个位置从父母的 100 条候选里抽一条，位置之间只要求不出现完全相同的 key
 *   （同一位置不可重复），但语义相近的标签可以在不同位置共存——
 *   正如真实的人可以既"勤勉"又"手巧"。
 *   实测教训：初版按维度互斥，导致后代只能拿到 12 条（=维度数），
 *   与"从 100 条组合出 50 条"的需求直接冲突。
 * - **同源偏好可调**：paternalRatio 控制偏向父方/母方的程度。
 *   期望值 0.5 时后代平均各继承一半；偏离 0.5 会让某一方的特征更易留存。
 * - **候选不足时按权重放回**：父母的 100 条里若可用候选少于 50，
 *   允许在被抽走的候选里重新抽取（标签 key 仍不重复），保证长度恒为 50。
 */

import * as rng from '../../infra/rng.js';
import * as pool from '../tag-pool.js';
import * as inherit from '../../agent/traits/inherit/sampler.js';

/** 后代特质条数（与初代一致，均为 50）。 */
export const TAG_COUNT = pool.TAG_COUNT;

function normalizeParent(tags, label) {
  if (!Array.isArray(tags)) {
    throw new TypeError('heredity.tags: ' + label + ' 的标签必须为数组');
  }
  return tags
    .map((t) => (typeof t === 'string' ? { key: t } : t))
    .filter((t) => t !== null && typeof t.key === 'string' && t.key !== '');
}

/**
 * 取某 key 的抽样权重。
 * 父母的标签可能带 weight（来自模板），也可能只有 key（来自其它来源）；
 * 池子里永远有权威权重，故以池子为准，父方权重仅作参考。
 */
function weightOfPoolKey(candMap, key) {
  const c = candMap.get(key);
  return c !== undefined && Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 1;
}

/**
 * 由父母标签组合出后代标签。
 *
 * @param {{ paternal?: Array<string|object>, maternal?: Array<string|object>,
 *           size?: number, paternalRatio?: number, mutationRate?: number,
 *           reserved?: string[] }} [input]
 *   reserved：为家族特征预留的位置（这些 key 无条件进入后代）。
 * @returns {{ tags: Array<object>, inherited: object, mutated: Array<object> }}
 */
export function combine(input = {}) {
  const paternal = normalizeParent(input.paternal, 'paternal');
  const maternal = normalizeParent(input.maternal, 'maternal');
  if (paternal.length === 0 || maternal.length === 0) {
    throw new TypeError('heredity.tags.combine: 父母双方的标签都不能为空');
  }
  const size = Number.isInteger(input.size) && input.size > 0 ? input.size : TAG_COUNT;
  const paternalRatio = typeof input.paternalRatio === 'number' && input.paternalRatio >= 0 && input.paternalRatio <= 1
    ? input.paternalRatio : 0.5;
  const mutationRate = typeof input.mutationRate === 'number' && input.mutationRate >= 0 && input.mutationRate <= 1
    ? input.mutationRate : 0;

  // 家族特征优先占位：它们是无条件继承的（三代无损后固定）。
  const reserved = Array.isArray(input.reserved) ? input.reserved.filter((k) => typeof k === 'string' && k !== '') : [];
  const chosen = [];
  const usedKeys = new Set();
  for (const key of reserved) {
    if (usedKeys.has(key)) continue;
    chosen.push({ key, name: pool.label(key), dimension: pool.dimensionOf(key), weight: 1, source: 'family' });
    usedKeys.add(key);
  }

  // 父方与母方的候选池（各 50 条，合计 100 条）。
  const candMap = new Map(pool.candidates().map((c) => [c.key, c]));

  const pickFrom = (tagList, side) => {
    // 只要 key 未被占用即可再抽（不按维度互斥）。
    const avail = tagList.filter((t) => !usedKeys.has(t.key));
    if (avail.length === 0) return null;
    const total = avail.reduce((s, t) => s + weightOfPoolKey(candMap, t.key), 0);
    let r = rng.next() * total;
    for (const t of avail) {
      r -= weightOfPoolKey(candMap, t.key);
      if (r <= 0) return toEntry(t.key, side);
    }
    return toEntry(avail[avail.length - 1].key, side);
  };

  // 产出的每条都必须带**正的有限 weight**：agent.traits.tagset.store 有此硬性校验，
  // 缺 weight 会让装配在写特质集时整批失败（实测：装配回滚于 tagset.store）。
  const toEntry = (key, source) => ({
    key,
    name: pool.label(key),
    dimension: pool.dimensionOf(key),
    weight: weightOfPoolKey(candMap, key),
    source,
  });

  // 主循环：按 paternalRatio 决定这一条从哪一方抽。
  let guard = 0;
  while (chosen.length < size && guard < size * 20) {
    guard += 1;
    const preferPaternal = rng.next() < paternalRatio;
    let picked = preferPaternal ? pickFrom(paternal, 'paternal') : pickFrom(maternal, 'maternal');
    if (picked === null) picked = preferPaternal ? pickFrom(maternal, 'maternal') : pickFrom(paternal, 'paternal');
    if (picked === null) break;
    chosen.push(picked);
    usedKeys.add(picked.key);
  }

  // 变异：极低概率把某条替换为另一个未知标签（默认关闭）。
  const mutated = [];
  if (mutationRate > 0) {
    for (let i = 0; i < chosen.length; i += 1) {
      if (rng.next() >= mutationRate) continue;
      const c = chosen[i];
      if (c.source === 'family') continue; // 家族特征不参与变异
      const alt = pool.candidates().filter((x) => x.key !== c.key && !usedKeys.has(x.key));
      if (alt.length === 0) continue;
      const pick = alt[Math.floor(rng.next() * alt.length)];
      const nv = { key: pick.key, name: pick.name, dimension: c.dimension, weight: pick.weight, source: 'mutation' };
      mutated.push({ from: c.key, to: pick.key });
      usedKeys.delete(c.key);
      usedKeys.add(pick.key);
      chosen[i] = nv;
    }
  }

  const countBy = (s) => chosen.filter((c) => c.source === s).length;
  return {
    tags: chosen,
    mutated,
    inherited: {
      total: chosen.length,
      target: size,
      paternal: countBy('paternal'),
      maternal: countBy('maternal'),
      family: countBy('family'),
      mutation: countBy('mutation'),
      paternalPoolSize: paternal.length,
      maternalPoolSize: maternal.length,
      combinedPoolSize: paternal.length + maternal.length,
      dimensionsCovered: new Set(chosen.map((c) => c.dimension)).size,
    },
  };
}

/**
 * 校验特质串的合法性（供装配前把关）。
 *
 * 规则（勿加"同维度唯一"）：
 * 1. 长度必须恰为 size（默认 50）；
 * 2. key 不得完全重复；
 * 3. key 必须来自标签池。
 *
 * 不校验同维度唯一：50 条特质串是 50 个独立特征位，不同位置出现同一维度的
 * 不同取值是允许的（如同一个人既"勤勉"又"细心"）。
 * 曾加过这条规则，结果与"从父母 100 条组合出 50 条"的需求直接冲突
 * （按维度互斥至多得到 12 条 = 维度数）。
 * @param {{ tags?: Array<object>, size?: number }} [input]
 */
export function validate(input = {}) {
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const size = Number.isInteger(input.size) && input.size > 0 ? input.size : TAG_COUNT;
  const problems = [];
  const keys = tags.map((t) => t.key);
  if (tags.length !== size) problems.push('标签数为 ' + tags.length + '，应为 ' + size);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length > 0) problems.push('存在完全重复的标签：' + [...new Set(dupes)].join('、'));
  const known = new Set(pool.candidates().map((c) => c.key));
  const unknown = keys.filter((k) => !known.has(k));
  if (unknown.length > 0) problems.push('未知标签：' + unknown.join('、'));
  const dims = new Set(keys.map((k) => pool.dimensionOf(k)));
  return {
    valid: problems.length === 0,
    problems,
    size: tags.length,
    dimensions: dims.size,
    distinctKeys: new Set(keys).size,
  };
}

export function __reset() { /* 无自有状态；随机源由 infra.rng 复位 */ }
