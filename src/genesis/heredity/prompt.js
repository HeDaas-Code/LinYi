/**
 * truman-town.genesis.heredity.prompt — 遗传提示装配。
 *
 * 把父母的特质、家族特征与已固定的家族标签装配成一段**可读的家世陈述**，
 * 供 AI 提示词与编年志使用（例如"这孩子继承了父亲的强韧与母亲的好奇"）。
 *
 * 设计取舍：
 * - **只陈述事实，不做推断**：文本里的每条继承关系都来自 heredity.tags.combine
 *   的统计结果，不额外编造"因为父亲很强壮所以孩子也很强壮"这类因果。
 * - **可读名而非 key**：对居民暴露的是"体质·强健"，不是 "physique.hardy"。
 * - **无 AI 也能用**：这是**模板装配**，不调用任何模型；
 *   有模型时它作为提示词的一部分，没模型时它就是全部。
 */

import * as pool from '../tag-pool.js';
import * as heredity from './tags.js';

function readable(tags, limit) {
  const list = Array.isArray(tags) ? tags.map((t) => pool.label(t.key)).filter((s) => s !== '') : [];
  if (list.length <= limit) return list.join('、');
  return list.slice(0, limit).join('、') + ' 等 ' + list.length + ' 项';
}

/**
 * 装配后代的家世陈述。
 * @param {{ childName?: string, paternalName?: string, maternalName?: string,
 *           paternal?: Array<object>, maternal?: Array<object>, child?: Array<object>,
 *           family?: string[], limit?: number, generation?: number }} [input]
 */
export function assemble(input = {}) {
  const limit = Number.isInteger(input.limit) && input.limit > 0 ? input.limit : 6;
  const childName = typeof input.childName === 'string' && input.childName !== '' ? input.childName : '这个孩子';
  const paternalName = typeof input.paternalName === 'string' && input.paternalName !== '' ? input.paternalName : '父亲';
  const maternalName = typeof input.maternalName === 'string' && input.maternalName !== '' ? input.maternalName : '母亲';
  const generation = Number.isInteger(input.generation) ? input.generation : 1;

  // 若调用方未给 child，就地组合一份（保持与 combine 完全一致的统计口径）。
  let childTags = Array.isArray(input.child) ? input.child : null;
  let inherited = null;
  if (childTags === null && Array.isArray(input.paternal) && Array.isArray(input.maternal)) {
    const combined = heredity.combine({
      paternal: input.paternal,
      maternal: input.maternal,
      reserved: input.family,
    });
    childTags = combined.tags;
    inherited = combined.inherited;
  }

  const paternalKeys = new Set((input.paternal ?? []).map((t) => t.key));
  const maternalKeys = new Set((input.maternal ?? []).map((t) => t.key));
  const family = Array.isArray(input.family) ? input.family : [];
  const familySet = new Set(family);
  let fromFather = 0;
  let fromMother = 0;
  let fromBoth = 0;
  let fromFamily = 0;
  for (const t of childTags ?? []) {
    // 家族特征单独归类：它们虽然也存在于父母池里，但继承是**无条件**的，
    // 若同时计入"来自父方/母方"，各来源之和会超过总数（实测 51 ≠ 50）。
    if (familySet.has(t.key)) { fromFamily += 1; continue; }
    const p = paternalKeys.has(t.key);
    const m = maternalKeys.has(t.key);
    if (p && m) fromBoth += 1;
    else if (p) fromFather += 1;
    else if (m) fromMother += 1;
  }
  const lines = [];
  lines.push(childName + '（第 ' + generation + ' 代）出生。');
  lines.push('继承了 ' + paternalName + ' 的 ' + fromFather + ' 项特征、'
    + maternalName + ' 的 ' + fromMother + ' 项特征'
    + (fromBoth > 0 ? '，以及双方共有的 ' + fromBoth + ' 项' : '') + '。');
  if (Array.isArray(input.paternal) && input.paternal.length > 0) {
    lines.push(paternalName + '的显著特征：' + readable(input.paternal, limit) + '。');
  }
  if (Array.isArray(input.maternal) && input.maternal.length > 0) {
    lines.push(maternalName + '的显著特征：' + readable(input.maternal, limit) + '。');
  }
  if (childTags !== null) {
    lines.push('后代特质（共 ' + childTags.length + ' 项）：' + readable(childTags, limit) + '。');
  }
  if (family.length > 0) {
    lines.push('家族固定特征：' + family.map((k) => pool.label(k)).join('、') + '。');
  }

  return {
    text: lines.join(''),
    lines,
    generation,
    counts: {
      child: (childTags ?? []).length,
      fromFather,
      fromMother,
      fromBoth,
      fromFamily,
      family: family.length,
      paternalPool: (input.paternal ?? []).length,
      maternalPool: (input.maternal ?? []).length,
    },
    inherited,
  };
}

export function __reset() { /* 无自有状态 */ }
