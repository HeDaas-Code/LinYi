/**
 * truman-town.genesis.agent_factory.template — 居民模板。
 *
 * 「模板」描述**一类居民**的构成方式（50 条特质标签怎么来、身份/动机/性格
 * 各自怎么抽样），而不是某一个具体居民。
 * instantiate 用模板 + 一个名字产出一个完整的居民描述，交由 assemble 创建。
 *
 * 设计取舍：
 * - **模板是数据，不是代码**：模板只是参数集合（各维度的抽样分布），
 *   因此可以在运行中引入新模板（如"避难所出生的第二代"）而不改代码。
 * - **模板不写世界状态**：build/instantiate 都是纯函数；
 *   真正写状态的是 agent_factory.assemble（分离关注点，也便于单测）。
 * - **50 条标签由 tagset.sampler 抽样**：模板只决定"抽什么分布"，
 *   不复制一份抽样逻辑，避免两处规则漂移。
 */

import * as rng from '../../infra/rng.js';
import * as pool from '../tag-pool.js';

/** 特质标签总数（用户需求：每个 Agent 固定 50 条标签）。 */
export const TAG_COUNT = pool.TAG_COUNT;

/** 内置模板：避难所初代居民。 */
const BUILTIN = Object.freeze({
  survivor: Object.freeze({
    id: 'survivor',
    name: '避难所幸存者',
    description: '核冬天后进入避难所的第一代居民：偏坚韧、务实，好奇心被压抑。',
    traits: Object.freeze({ size: TAG_COUNT, resilienceBias: 0.15, curiosityBias: -0.1 }),
    persona: Object.freeze({ motivationBias: 0.1, personalitySpread: 0.5 }),
  }),
  native: Object.freeze({
    id: 'native',
    name: '避难所新生代',
    description: '在避难所内出生的一代：未曾见过地表，好奇但缺乏野外经验。',
    traits: Object.freeze({ size: TAG_COUNT, resilienceBias: -0.05, curiosityBias: 0.2 }),
    persona: Object.freeze({ motivationBias: 0, personalitySpread: 0.65 }),
  }),
});

/** @type {Map<string, object>} 模板注册表 */
const templates = new Map();

export function __reset() {
  templates.clear();
  for (const t of Object.values(BUILTIN)) templates.set(t.id, structuredClone(t));
}

function ensure() {
  if (templates.size === 0) __reset();
}

function assertTemplateId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('agent_factory.template: 模板 id 必须为非空字符串');
  }
}

/**
 * 定义一个模板（幂等 upsert）。
 * @param {{ id: string, name?: string, description?: string,
 *           traits?: { size?: number, resilienceBias?: number, curiosityBias?: number },
 *           persona?: { motivationBias?: number, personalitySpread?: number } }} input
 */
export function build(input = {}) {
  assertTemplateId(input.id);
  const size = Number.isInteger(input.traits?.size) && input.traits.size > 0
    ? input.traits.size : TAG_COUNT;
  const template = {
    id: input.id,
    name: typeof input.name === 'string' && input.name !== '' ? input.name : input.id,
    description: typeof input.description === 'string' ? input.description : '',
    traits: {
      size,
      resilienceBias: clampBias(input.traits?.resilienceBias),
      curiosityBias: clampBias(input.traits?.curiosityBias),
    },
    persona: {
      motivationBias: clampBias(input.persona?.motivationBias),
      personalitySpread: typeof input.persona?.personalitySpread === 'number'
        ? Math.max(0, Math.min(1, input.persona.personalitySpread)) : 0.5,
    },
  };
  templates.set(template.id, template);
  return structuredClone(template);
}

function clampBias(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(-1, Math.min(1, n));
}

export function get(input = {}) {
  ensure();
  assertTemplateId(input.id);
  const t = templates.get(input.id);
  return t === undefined ? null : structuredClone(t);
}

export function list() {
  ensure();
  return [...templates.keys()].sort().map((id) => structuredClone(templates.get(id)));
}

/**
 * 用模板产出一个居民描述（纯函数，不写任何状态）。
 *
 * 特质的生成方式：先按模板偏置从 tagset 抽样 50 条，再对偏置维度做**确定性**
 * 的增补——增补用 rng，因此同种子同模板同名字必得同一份特质。
 *
 * @param {{ templateId?: string, name?: string, agentId?: string }} [input]
 */
export function instantiate(input = {}) {
  ensure();
  const templateId = input.templateId ?? 'survivor';
  assertTemplateId(templateId);
  const template = templates.get(templateId);
  if (template === undefined) {
    throw new Error('agent_factory.template.instantiate: 未定义的模板 "' + templateId + '"');
  }
  const name = typeof input.name === 'string' && input.name !== '' ? input.name : null;
  const agentId = typeof input.agentId === 'string' && input.agentId !== '' ? input.agentId : null;

  // 抽样 50 条标签。
  // 抽样规则是**维度内互斥、维度间独立**：每个维度抽一个取值。
  // 这样 50 条标签表达的是"这个人在各维度上分别是什么样"，而不是 50 条
  // 互相矛盾的碎片（如同时"强健"且"孱弱"）。
  // 旧实现从 5 个固定标签里无放回抽 5 个 → 全员标签完全相同，是真实缺口。
  const tags = sampleByDimension(template);

  return {
    templateId,
    agentId,
    name,
    tags,
    tagCount: tags.length,
    persona: {
      motivationBias: template.persona.motivationBias,
      personalitySpread: template.persona.personalitySpread,
    },
  };
}

/**
 * 把模板偏置映射为某候选标签的权重倍率。
 * 只对相关维度生效，其余维度保持中性（×1）。
 */
function biasMultiplier(template, cand) {
  const r = template.traits.resilienceBias;
  const c = template.traits.curiosityBias;
  let m = 1;
  if (cand.dimension === 'resilience') {
    m *= (cand.value === 'resilient' || cand.value === 'adaptable') ? (1 + r) : (1 - r);
  }
  if (cand.dimension === 'physique') {
    m *= (cand.value === 'hardy' || cand.value === 'stocky') ? (1 + r) : (1 - r * 0.5);
  }
  if (cand.dimension === 'drive') {
    m *= (cand.value === 'hardworking') ? (1 + r) : 1;
  }
  if (cand.dimension === 'curiosity') {
    m *= (cand.value === 'curious' || cand.value === 'wanderer') ? (1 + c) : (1 - c * 0.5);
  }
  if (cand.dimension === 'intellect') {
    m *= (cand.value === 'inventive' || cand.value === 'sharp') ? (1 + c) : 1;
  }
  // 下限不能太低：0.05 会让"负偏置"的取值在 50 次抽取里几乎必然抽不到，
  // 使偏置在统计上不可观测（实测 resilienceBias=-0.9 时 frail 出现 0 次）。
  return Math.max(0.2, m);
}

/**
 * 维度内互斥抽样，维度间独立，产出至多 size 条不重复标签。
 * 每个维度优先抽一个取值；维度用完后，若仍未达目标数量，
 * 再从剩余候选里按权重补足（使总数稳定为 size，且永不重复）。
 */
function sampleByDimension(template) {
  const target = template.traits.size;
  const chosen = [];
  const used = new Set();

  const pickWeighted = (cands) => {
    const total = cands.reduce((s, x) => s + x.weight, 0);
    if (total <= 0) return cands[0];
    let r = rng.next() * total;
    for (const c of cands) { r -= c.weight; if (r <= 0) return c; }
    return cands[cands.length - 1];
  };

  // 从全池按权重抽取 target 条不重复标签。
  // **不按维度互斥**：50 条特质串是 50 个独立特征位，不是 12 个维度的投影。
  // 实测教训：初版"每维抽一个"，结果每个居民只有 12 条标签（=维度数），
  // 与"每个 Agent 50 条标签"的需求直接冲突。
  const all = pool.candidates().map((c) => ({ ...c, weight: c.weight * biasMultiplier(template, c) }));
  const rest = all.slice();
  while (chosen.length < target && rest.length > 0) {
    const picked = pickWeighted(rest);
    chosen.push(picked);
    used.add(picked.key);
    rest.splice(rest.indexOf(picked), 1);
  }

  return chosen.slice(0, target).map((c) => ({
    key: c.key, name: c.name, dimension: c.dimension, weight: c.weight,
  }));
}
