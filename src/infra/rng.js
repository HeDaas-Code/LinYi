/**
 * truman-town.infra.rng — 随机与种子 / RNG
 *
 * 提供可复现的随机数：seed(value) 固定随机源，next() 产出 [0, 1) 的均匀浮点。
 * 采用 mulberry32（32 位整数种子，确定性、无外部依赖），同一 seed 永远产出同一序列，
 * 使生存事件、特质采样、探索结算等随机行为可回放。
 */

// 曾有一个 `seeded` 标记，但 next()/int()/float() 从不读取它，
// 属于「只写不读」的死状态，已删除（见 bin/flow-index.mjs 的 store/never-read 诊断）。
let state = 0x9e3779b9 >>> 0;

/** 字符串 → 32 位无符号整数哈希（xmur3 风格）。 */
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a) {
  return function nextUint32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let gen = mulberry32(state);

/**
 * 固定随机源。seed 可为数字或字符串，内部统一按字符串哈希。
 * @param {number | string} seedValue
 * @returns {number | string} 传入的 seedValue（便于链式 / 记录）
 */
export function seed(seedValue) {
  const str = String(seedValue);
  state = hashSeed(str);
  gen = mulberry32(state);
  return seedValue;
}

/**
 * 产出 [0, 1) 的均匀伪随机浮点。
 * @returns {number}
 */
export function next() {
  return gen();
}

/**
 * 产出 [min, max] 闭区间整数（辅助方法，不属于声明 RPC 契约）。
 * @param {number} min
 * @param {number} max
 */
export function int(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) throw new RangeError(`rng.int: 非法区间 [${min}, ${max}]`);
  return lo + Math.floor(next() * (hi - lo + 1));
}

/**
 * 产出 [min, max) 浮点（辅助方法）。
 * @param {number} min
 * @param {number} max
 */
export function float(min, max) {
  return min + next() * (max - min);
}

/**
 * 从数组中等概率随机取一个元素（辅助方法）。
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
export function choice(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new TypeError('rng.choice: arr 必须为非空数组');
  }
  return arr[Math.floor(next() * arr.length)];
}

/**
 * 返回 Fisher–Yates 洗牌后的新数组（辅助方法，不修改原数组）。
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
export function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 复位到默认未播种状态（测试用）。 */
export function __reset() {
  state = 0x9e3779b9 >>> 0;
  gen = mulberry32(state);
}
