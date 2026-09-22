/**
 * truman-town.social.procreation.offspring — 子代创建 / Offspring Creation
 *
 * 请求创建子代：读父母各 50 tag，复用 agent.traits.inherit.sampler/validator
 * 组合成子代 50 tag（可选合并家族特质），分配新 ID 并写入子代标签集。
 */

import * as inheritSampler from '../../agent/traits/inherit/sampler.js';
import * as inheritValidator from '../../agent/traits/inherit/validator.js';
import * as tagsetStore from '../../agent/traits/tagset/store.js';
import * as identity from '../../infra/identity.js';
import * as familyInherit from '../family/inherit/applier.js';

/**
 * 纯组合：父母 50 tag → 子代 50 tag（复用 inherit.sampler + validator）。
 * @param {{ paternalTags: Array, maternalTags: Array, size?: number, paternalRatio?: number }} input
 * @returns {{ tags: Array, valid: boolean, validation: object }}
 */
export function compose({ paternalTags, maternalTags, size = 50, paternalRatio = 0.5 } = {}) {
  const tags = inheritSampler.combine(paternalTags, maternalTags, { size, paternalRatio });
  const validation = inheritValidator.validate(tags, { size });
  return { tags, valid: validation.ok, validation };
}

/**
 * 请求创建子代：读父母标签 → 组合（可选合并家族特质）→ 建号 → 写入标签集。
 * @param {{ a: string, b: string, familyId?: string, familyTraits?: Array, name?: string, paternalRatio?: number }} input
 */
export function request({ a, b, familyId = null, familyTraits = [], name, paternalRatio = 0.5 } = {}) {
  const ta = tagsetStore.get(a);
  const tb = tagsetStore.get(b);
  if (ta === null || tb === null) {
    throw new Error('offspring.request: 父母标签集不存在');
  }
  const paternalTags = ta.tags;
  const maternalTags = tb.tags;
  let result;
  if (Array.isArray(familyTraits) && familyTraits.length > 0) {
    result = familyInherit.apply({ paternal: paternalTags, maternal: maternalTags, familyTraits, paternalRatio });
  } else {
    result = compose({ paternalTags, maternalTags, paternalRatio });
  }
  const id = identity.next('agent');
  tagsetStore.upsert(id, result.tags);
  return {
    id,
    name: typeof name === 'string' && name.trim() !== '' ? name : '新生儿' + id,
    parents: [a, b],
    familyId,
    tags: result.tags,
    valid: result.valid,
    familyTraitsApplied: result.familyTraitsApplied ?? [],
  };
}

/** 复位底层状态（测试用）。 */
export function __reset() {
  tagsetStore.__reset();
  identity.__reset();
}
