/**
 * truman-town.social.family.trait.detector — 三代检测器 / Trait Detector
 *
 * 检测某 tag 是否在家族内连续遗传三代未遗失（"三代未遗失"：在最近连续三代
 * 中都出现）。纯函数：接收按代（旧→新）排列的标签集合，不做持久化。
 */

function normalize(generations) {
  if (!Array.isArray(generations)) {
    throw new TypeError('detector: generations 必须为数组');
  }
  return generations.map((g) => {
    if (Array.isArray(g)) {
      return new Set(g.map((x) => (typeof x === 'string' ? x : x && x.key)).filter(Boolean));
    }
    if (g instanceof Set) return new Set(g);
    return new Set();
  });
}

/** 从最新一代往前，统计 tag 连续出现的代数。 */
function survivalCount(gens, tagKey) {
  let count = 0;
  for (let i = gens.length - 1; i >= 0; i -= 1) {
    if (gens[i].has(tagKey)) count += 1;
    else break;
  }
  return count;
}

/**
 * 判断 tagKey 是否连续三代未遗失。
 * @param {Array<Array<string>|Set<string>>} generations 按代（旧→新）排列的标签集合
 * @param {string} tagKey
 * @returns {{ tagKey: string, survived: boolean, survivedCount: number }}
 */
export function three_generations(generations, tagKey) {
  const gens = normalize(generations);
  const count = survivalCount(gens, tagKey);
  return { tagKey, survived: count >= 3, survivedCount: count };
}

/**
 * 检测最新一代所有候选 tag 的三代存活情况。
 * @param {Array<Array<string>|Set<string>>} generations
 * @returns {Array<{ tagKey: string, survived: boolean, survivedCount: number }>}
 */
export function detect(generations) {
  const gens = normalize(generations);
  const last = gens[gens.length - 1] ?? new Set();
  const out = [];
  for (const tagKey of last) {
    const count = survivalCount(gens, tagKey);
    out.push({ tagKey, survived: count >= 3, survivedCount: count });
  }
  return out;
}

/** 纯函数模块：无状态复位。 */
export function __reset() {}
