/**
 * truman-town.agent.traits.inherit.validator — 遗传校验器 / Inheritance Validator
 *
 * 校验子代标签串的合法性（数量、key 唯一、权重为正），并审计其继承比例。
 */

import { TAG_COUNT } from '../tagset/store.js';

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * 校验标签集合法性。
 * @param {Array<{ key: string, weight: number }>} tags
 * @param {{ size?: number }} [options]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validate(tags, options = {}) {
  const size = options.size ?? TAG_COUNT;
  const errors = [];
  if (!Array.isArray(tags)) {
    return { ok: false, errors: ['tags 必须为数组'] };
  }
  if (tags.length !== size) {
    errors.push(`标签数量必须为 ${size}，实际 ${tags.length}`);
  }
  const seen = new Set();
  for (const tag of tags) {
    if (tag === null || typeof tag !== 'object' || Array.isArray(tag)) {
      errors.push('每个标签必须为对象');
      continue;
    }
    if (typeof tag.key !== 'string' || !KEY_RE.test(tag.key)) {
      errors.push(`非法标签 key: ${String(tag.key)}`);
    } else if (seen.has(tag.key)) {
      errors.push(`标签 key 重复: ${tag.key}`);
    } else {
      seen.add(tag.key);
    }
    if (typeof tag.weight !== 'number' || !Number.isFinite(tag.weight) || tag.weight <= 0) {
      errors.push(`标签 "${tag.key ?? '?'}" 的权重必须为正有限数`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 审计子代继承比例：统计来自父本 / 母本 / 共有 / 新变异的数量与占比。
 * 当超过一半标签无法追溯到父代时，plausible 记为 false。
 * @param {Array<{ key: string }>} child
 * @param {Array<{ key: string }>} paternal
 * @param {Array<{ key: string }>} maternal
 */
export function audit(child, paternal, maternal) {
  const childTags = Array.isArray(child) ? child : [];
  const paternalKeys = new Set((paternal ?? []).map((t) => t.key));
  const maternalKeys = new Set((maternal ?? []).map((t) => t.key));
  const known = new Set([...paternalKeys, ...maternalKeys]);
  let inherited = 0;
  let novel = 0;
  for (const tag of childTags) {
    if (tag && known.has(tag.key)) inherited += 1;
    else novel += 1;
  }
  const total = childTags.length;
  const inheritedRatio = total === 0 ? 0 : inherited / total;
  const novelRatio = total === 0 ? 0 : novel / total;
  return {
    total,
    inherited,
    novel,
    inheritedRatio,
    novelRatio,
    plausible: novelRatio <= 0.5,
  };
}

/** 无状态；提供统一复位入口（测试用）。 */
export function __reset() {}
