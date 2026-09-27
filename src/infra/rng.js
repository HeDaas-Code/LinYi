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

/**
 * mulberry32 PRNG。
 * @param {number} a 初始累加器（32 位）
 * @param {(accumulator: number) => void} [onAdvance] 每次产出后回调当前累加器，
 *   供 __snapshot 采集「流位置」而不只是种子。
 */
function mulberry32(a, onAdvance) {
  return function nextUint32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    if (onAdvance !== undefined) onAdvance(a);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成器当前内部状态（32 位无符号）。
 *
 * mulberry32 是**有状态闭包**：种子只决定起点，之后每次 next() 都改写闭包里的
 * 累加器。若只记录种子而不记录这个累加器，恢复后 RNG 会从「种子起点」重放，
 * 于是续跑的随机序列与连续运行**不同**——生存事件、特质采样、探索结算全部错位。
 * 因此每次 next() 都把累加器同步回本变量，供 __snapshot 采集。
 */
let genState = state;
let gen = mulberry32(state, (a) => { genState = a; });

/**
 * 固定随机源。seed 可为数字或字符串，内部统一按字符串哈希。
 * @param {number | string} seedValue
 * @returns {number | string} 传入的 seedValue（便于链式 / 记录）
 */
export function seed(seedValue) {
  const str = String(seedValue);
  state = hashSeed(str);
  genState = state;
  gen = mulberry32(state, (a) => { genState = a; });
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
  genState = state;
  gen = mulberry32(state, (a) => { genState = a; });
}

// ---- 持久化：随机流的「位置」必须进存档 ----

/**
 * 导出 RNG 状态：种子 + 当前累加器。
 *
 * 只有种子不够（见 genState 说明）——必须同时保存流位置，恢复后才能与
 * 连续运行逐位一致。
 */
export function __snapshot() {
  return { seed: state >>> 0, position: genState >>> 0 };
}

/**
 * 恢复 RNG 状态，并把生成器推进到存档时的流位置。
 * @param {{seed?: number, position?: number}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('rng.__restore: 状态必须为对象');
  }
  const seedValue = Number.isInteger(data.seed) ? (data.seed >>> 0) : (0x9e3779b9 >>> 0);
  state = seedValue;
  genState = seedValue;
  gen = mulberry32(seedValue, (a) => { genState = a; });
  const pos = data.position;
  if (Number.isInteger(pos) && (pos >>> 0) !== seedValue) {
    // 直接重建到目标累加器：累加器本身就是完整的流状态，无需重放。
    genState = pos >>> 0;
    gen = mulberry32(genState, (a) => { genState = a; });
  }
  return { seed: state, position: genState };
}
