/**
 * truman-town.genesis.tag-pool — 特质标签池。
 *
 * 提供**足够宽的标签池**，使「每个居民 50 条特质串」成为真实抽样结果，
 * 而不是把 5 个固定标签抄 10 遍。
 *
 * 设计取舍：
 * - **标签是 (维度, 取值) 的二元组**：如 (体质, 强健) / (体质, 虚弱)。
 *   同一维度的不同取值互斥，不同维度可自由组合。这样 50 条标签表达的是
 *   "这个人在 12 个维度上分别是什么样"，而不是 50 条互相矛盾的碎片。
 * - **维度数与每维取值数决定组合空间**：12 维 × 每维约 5 个取值 ≈ 50 个候选，
 *   居民从每个维度抽一个取值即得 50 条以内的有序特质串。
 * - **有放回 vs 无放回**：同一维度内**互斥抽样**（无放回），维度间独立。
 *   这既保证标签不矛盾，又让任意两个居民几乎不可能完全相同。
 * - **稳定 key**：标签 key 是 "维度_取值" 形式（下划线连接），供遗传/漂移/相似度直接比较。
 *   注意必须用下划线而非点号：agent.traits.tagset.store 的既有契约要求 key 匹配
 *   /^[a-z][a-z0-9_]{0,31}$/（点号非法）。可读名（如"体质·强健"）由 label() 单独给出，
 *   不占用 key 的字符集。
 */

/** 维度定义：每个维度含若干取值，取值带抽样权重。 */
export const DIMENSIONS = Object.freeze({
  physique: Object.freeze({
    name: '体质',
    values: Object.freeze([
      { value: 'hardy', name: '强健', weight: 1.0 },
      { value: 'frail', name: '孱弱', weight: 0.6 },
      { value: 'lanky', name: '瘦高', weight: 0.9 },
      { value: 'stocky', name: '矮壮', weight: 0.9 },
      { value: 'scarred', name: '带伤', weight: 0.4 },
    ]),
  }),
  temperament: Object.freeze({
    name: '性情',
    values: Object.freeze([
      { value: 'calm', name: '沉稳', weight: 1.0 },
      { value: 'hotblooded', name: '热血', weight: 0.9 },
      { value: 'melancholic', name: '忧郁', weight: 0.7 },
      { value: 'cheerful', name: '开朗', weight: 1.0 },
      { value: 'brooding', name: '阴郁', weight: 0.5 },
    ]),
  }),
  intellect: Object.freeze({
    name: '心智',
    values: Object.freeze([
      { value: 'sharp', name: '敏锐', weight: 0.9 },
      { value: 'inventive', name: '善发明', weight: 0.6 },
      { value: 'literate', name: '识字', weight: 1.0 },
      { value: 'illiterate', name: '不识字', weight: 0.5 },
      { value: 'forgetful', name: '健忘', weight: 0.6 },
    ]),
  }),
  drive: Object.freeze({
    name: '意志',
    values: Object.freeze([
      { value: 'hardworking', name: '勤勉', weight: 1.1 },
      { value: 'idle', name: '懒散', weight: 0.6 },
      { value: 'ambitious', name: '野心', weight: 0.7 },
      { value: 'content', name: '知足', weight: 0.9 },
      { value: 'obsessive', name: '执念', weight: 0.4 },
    ]),
  }),
  social: Object.freeze({
    name: '社交',
    values: Object.freeze([
      { value: 'sociable', name: '合群', weight: 1.0 },
      { value: 'solitary', name: '孤僻', weight: 0.7 },
      { value: 'loyal', name: '忠厚', weight: 0.9 },
      { value: 'cunning', name: '狡黠', weight: 0.5 },
      { value: 'generous', name: '慷慨', weight: 0.7 },
      { value: 'greedy', name: '贪婪', weight: 0.5 },
    ]),
  }),
  courage: Object.freeze({
    name: '胆识',
    values: Object.freeze([
      { value: 'reckless', name: '鲁莽', weight: 0.6 },
      { value: 'cautious', name: '谨慎', weight: 1.1 },
      { value: 'timid', name: '怯懦', weight: 0.6 },
      { value: 'steadfast', name: '坚毅', weight: 0.8 },
    ]),
  }),
  curiosity: Object.freeze({
    name: '好奇心',
    values: Object.freeze([
      { value: 'curious', name: '好奇', weight: 0.9 },
      { value: 'settled', name: '安土', weight: 1.0 },
      { value: 'wanderer', name: '漂泊', weight: 0.5 },
    ]),
  }),
  craft: Object.freeze({
    name: '手艺',
    values: Object.freeze([
      { value: 'dexterous', name: '手巧', weight: 0.8 },
      { value: 'clumsy', name: '笨拙', weight: 0.7 },
      { value: 'meticulous', name: '精细', weight: 0.7 },
      { value: 'improviser', name: '将就', weight: 0.9 },
    ]),
  }),
  faith: Object.freeze({
    name: '信念',
    values: Object.freeze([
      { value: 'devout', name: '虔信', weight: 0.7 },
      { value: 'skeptic', name: '怀疑', weight: 0.8 },
      { value: 'fatalist', name: '认命', weight: 0.7 },
      { value: 'hopeful', name: '怀抱希望', weight: 0.9 },
    ]),
  }),
  resilience: Object.freeze({
    name: '韧性',
    values: Object.freeze([
      { value: 'resilient', name: '强韧', weight: 0.9 },
      { value: 'fragile', name: '易折', weight: 0.6 },
      { value: 'adaptable', name: '善适应', weight: 0.9 },
      { value: 'rigid', name: '固执', weight: 0.6 },
    ]),
  }),
  origin: Object.freeze({
    name: '来历',
    values: Object.freeze([
      { value: 'native', name: '避难所出生', weight: 1.0 },
      { value: 'outsider', name: '外来者', weight: 0.5 },
      { value: 'engineer', name: '工程师出身', weight: 0.4 },
      { value: 'farmer', name: '农夫出身', weight: 0.6 },
      { value: 'medic', name: '医者出身', weight: 0.4 },
    ]),
  }),
  quirk: Object.freeze({
    name: '癖性',
    values: Object.freeze([
      { value: 'hoarder', name: '囤积', weight: 0.5 },
      { value: 'ascetic', name: '苦行', weight: 0.4 },
      { value: 'insomniac', name: '失眠', weight: 0.5 },
      { value: 'dreamer', name: '好梦', weight: 0.6 },
      { value: 'storyteller', name: '健谈', weight: 0.7 },
    ]),
  }),
});

/** 全部维度的 key 列表（稳定顺序）。 */
export const DIMENSION_KEYS = Object.freeze(Object.keys(DIMENSIONS));

/** 特质串的默认目标长度（用户需求：50 条）。 */
export const TAG_COUNT = 50;

/** key 分隔符：必须满足 tagset.store 的 /^[a-z][a-z0-9_]{0,31}$/。 */
export const KEY_SEPARATOR = '_';

/** 由维度与取值构造稳定 key。 */
export function makeKey(dimension, value) {
  return dimension + KEY_SEPARATOR + value;
}

/** 从 key 反解维度。 */
export function dimensionOf(key) {
  const i = String(key).indexOf(KEY_SEPARATOR);
  return i === -1 ? String(key) : String(key).slice(0, i);
}

/**
 * 把池子摊平成 {key, weight, dimension, value, name} 的候选数组。
 * key 形如 "physique_hardy"。
 */
export function candidates(dimensionFilter = null) {
  const out = [];
  for (const dimKey of DIMENSION_KEYS) {
    if (dimensionFilter !== null && dimKey !== dimensionFilter) continue;
    const dim = DIMENSIONS[dimKey];
    for (const v of dim.values) {
      out.push({
        key: makeKey(dimKey, v.value),
        dimension: dimKey,
        dimensionName: dim.name,
        value: v.value,
        name: v.name,
        weight: v.weight,
      });
    }
  }
  return out;
}

/** 标签 key → 可读名（如 physique_hardy → 体质·强健）。 */
export function label(key) {
  const i = String(key).indexOf(KEY_SEPARATOR);
  if (i === -1) return String(key);
  const dimKey = String(key).slice(0, i);
  const value = String(key).slice(i + 1);
  const dim = DIMENSIONS[dimKey];
  if (dim === undefined) return String(key);
  const v = dim.values.find((x) => x.value === value);
  return v === undefined ? String(key) : dim.name + '·' + v.name;
}

/** 池统计：维度数、候选总数。 */
export function stats() {
  const all = candidates();
  return {
    dimensions: DIMENSION_KEYS.length,
    candidates: all.length,
    perDimension: DIMENSION_KEYS.map((k) => ({ dimension: k, values: DIMENSIONS[k].values.length })),
  };
}
