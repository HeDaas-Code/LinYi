/**
 * truman-town.social.family.inherit.applier — 特质应用器 / Inheritance Applier
 *
 * 把家族特质（最多 5 个）合并进族内新生儿的 50 标签串。复用
 * agent.traits.inherit.sampler（父母各 50 tag 随机组合）与 validator（校验）。
 */

import * as inheritSampler from '../../../agent/traits/inherit/sampler.js';
import * as inheritValidator from '../../../agent/traits/inherit/validator.js';
import { TAG_COUNT } from '../../../agent/traits/tagset/store.js';

function traitKeys(familyTraits) {
  const out = new Set();
  for (const t of familyTraits ?? []) {
    if (typeof t === 'string') out.add(t);
    else if (t && typeof t.key === 'string') out.add(t.key);
  }
  return out;
}

/**
 * 把家族特质合并进标签串：确保每个家族特质 key 都在（缺失则替换最低权重的
 * 非家族标签）。保持标签总数不变。
 * @param {Array<{key:string,weight:number}>} tags
 * @param {Array<string|{key:string}>} familyTraits
 * @returns {Array}
 */
export function merge(tags, familyTraits) {
  const traits = traitKeys(familyTraits);
  if (traits.size === 0) return tags.map((t) => ({ ...t }));
  const result = tags.map((t) => ({ ...t }));
  const present = new Set(result.map((t) => t.key));
  for (const key of traits) {
    if (present.has(key)) continue;
    let minIdx = -1;
    for (let i = 0; i < result.length; i += 1) {
      if (traits.has(result[i].key)) continue;
      if (minIdx === -1 || result[i].weight < result[minIdx].weight) minIdx = i;
    }
    if (minIdx === -1) continue;
    result[minIdx] = { key, weight: 1.0 };
    present.add(key);
  }
  return result;
}

/**
 * 组合父母标签并合并家族特质，返回子代 50 标签串。
 * @param {{ paternal: Array, maternal: Array, familyTraits?: Array, size?: number, paternalRatio?: number }} input
 * @returns {{ tags: Array, valid: boolean, validation: object, familyTraitsApplied: string[] }}
 */
export function apply({ paternal, maternal, familyTraits = [], size = TAG_COUNT, paternalRatio = 0.5 } = {}) {
  const child = inheritSampler.combine(paternal, maternal, { size, paternalRatio });
  const merged = merge(child, familyTraits);
  const validation = inheritValidator.validate(merged, { size });
  return {
    tags: merged,
    valid: validation.ok,
    validation,
    familyTraitsApplied: [...traitKeys(familyTraits)],
  };
}

/** 复位底层采样器状态（测试用）。 */
export function __reset() {
  inheritSampler.__reset();
}
