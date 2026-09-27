/**
 * truman-town.survival.environment.weather — 灾变天气。
 *
 * 在核冬天后的地表：天气是探索与地表活动的**决定性风险因子**。
 *
 * 设计取舍：
 * - **按日预报，按 tick 推进**：预报不是随机噪声，而是由「天气游程」驱动的马尔可夫链——
 *   每种天气有持续时间，期间预报稳定；这使「根据预报决定是否出行」成为有信息的决策，
 *   而不是每次都要重新掷骰子（那会让预报失去价值）。
 * - **确定性**：全部取自 infra.rng，同种子逐位可复现。
 * - **无开放世界**：天气不模拟气压/洋流，只是若干档位 + 强度，
 *   供 expedition 与 events.impact 作为乘数使用。
 */

import * as rng from '../../infra/rng.js';

/**
 * 天气档位。severity 是探索风险乘数，shelterStress 是避难所外壳压力，
 * light 是地表能见度（影响探索收益），kind 供日志使用。
 */
export const KINDS = Object.freeze({
  clear: Object.freeze({ id: 'clear', name: '晴', severity: 0.0, shelterStress: 0.0, light: 1.0, minDays: 3, maxDays: 6 }),
  overcast: Object.freeze({ id: 'overcast', name: '阴', severity: 0.1, shelterStress: 0.0, light: 0.9, minDays: 2, maxDays: 5 }),
  acid_rain: Object.freeze({ id: 'acid_rain', name: '酸雨', severity: 0.45, shelterStress: 0.3, light: 0.5, minDays: 1, maxDays: 3 }),
  dust_storm: Object.freeze({ id: 'dust_storm', name: '沙暴', severity: 0.7, shelterStress: 0.5, light: 0.2, minDays: 1, maxDays: 2 }),
  black_frost: Object.freeze({ id: 'black_frost', name: '黑霜', severity: 0.55, shelterStress: 0.4, light: 0.4, minDays: 2, maxDays: 3 }),
  fallout_squall: Object.freeze({ id: 'fallout_squall', name: '放射性风暴', severity: 0.95, shelterStress: 0.7, light: 0.15, minDays: 1, maxDays: 2 }),
});

/** 转移表：当前天气 → [[下一档, 权重]]。权重之和不必为 1，取样时归一化。 */
const TRANSITIONS = Object.freeze({
  clear: [['overcast', 3], ['acid_rain', 2], ['dust_storm', 1], ['clear', 4]],
  overcast: [['clear', 3], ['acid_rain', 3], ['dust_storm', 2], ['black_frost', 2], ['overcast', 2]],
  acid_rain: [['overcast', 4], ['dust_storm', 2], ['black_frost', 2], ['fallout_squall', 1]],
  dust_storm: [['overcast', 3], ['clear', 2], ['fallout_squall', 2], ['acid_rain', 2]],
  black_frost: [['overcast', 3], ['clear', 2], ['acid_rain', 2], ['fallout_squall', 1]],
  fallout_squall: [['dust_storm', 2], ['black_frost', 2], ['acid_rain', 2], ['overcast', 2]],
});

/** 当前状态。 */
let current = null;

function pickWeighted(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  if (total <= 0) return pairs[0][0];
  let r = rng.next() * total;
  for (const [kind, w] of pairs) { r -= w; if (r <= 0) return kind; }
  return pairs[pairs.length - 1][0];
}

function rollDuration(kind) {
  const k = KINDS[kind];
  const span = k.maxDays - k.minDays;
  return k.minDays + (span <= 0 ? 0 : Math.floor(rng.next() * (span + 1)));
}

function makeState(kind, daysLeft) {
  const k = KINDS[kind];
  return {
    kind: k.id, name: k.name, severity: k.severity, shelterStress: k.shelterStress,
    light: k.light, daysLeft,
  };
}

/** 复位并生成一个初始天气（首次调用 forecast 时惰性发生）。 */
export function __reset() {
  current = null;
}

// ---- 持久化：当前天气必须进存档 ----

/**
 * 导出当前天气状态。
 *
 * 天气（severity / shelterStress / daysLeft）影响需求增长与避难所压力，
 * 且 daysLeft 是**跨 tick 倒计时**。不入档则恢复后天气回到「未初始化」，
 * 下一次 forecast 会重掷一个新天气：续跑与连续运行的天气轨迹分叉。
 * current=null 表示「尚未预报」，必须与「某个具体天气」区分保留。
 */
export function __snapshot() {
  return { current: current === null ? null : structuredClone(current) };
}

/**
 * 恢复当前天气（null 表示未初始化）。
 * @param {{current?: object|null}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('weather.__restore: 状态必须为对象');
  }
  current = (data.current === null || data.current === undefined) ? null : structuredClone(data.current);
  return { current: current === null ? null : current.kind };
}

/**
 * 预报当前天气。若尚未初始化或已到期，则推进到一个新天气。
 * @param {{ tick?: number, force?: boolean }} [input]
 */
export function forecast(input = {}) {
  if (current === null || current.daysLeft <= 0 || input.force === true) {
    const kind = current === null
      ? pickWeighted([['clear', 4], ['overcast', 3], ['acid_rain', 2], ['dust_storm', 1]])
      : pickWeighted(TRANSITIONS[current.kind] ?? TRANSITIONS.clear);
    current = makeState(kind, rollDuration(kind));
  }
  return { ...current, tick: typeof input.tick === 'number' ? input.tick : null };
}

/**
 * 把当前天气施加到避难所与探索上，并消耗一天持续时间。
 * 返回本日的天气快照与它对避难所造成的压力。
 * @param {{ shelter?: { damage?: Function }, applyStress?: boolean }} [ctx]
 */
export function strike(ctx = {}) {
  const w = forecast({ tick: ctx.tick });
  const stress = Math.max(0, w.shelterStress);
  let damageDealt = 0;
  if (ctx.applyStress !== false && stress > 0 && ctx.shelter && typeof ctx.shelter.damage === 'function') {
    damageDealt = stress;
    ctx.shelter.damage(stress);
  }
  if (current !== null) current.daysLeft -= 1;
  return { ...w, damageDealt, struck: true };
}

/** 供日志/观察者使用的可读描述。 */
export function describe(input = {}) {
  const w = forecast(input);
  const risk = w.severity >= 0.7 ? '极高' : w.severity >= 0.4 ? '较高' : w.severity > 0 ? '中等' : '低';
  return {
    ...w,
    text: '地表天气：' + w.name + '（剩余 ' + w.daysLeft + ' 天），探索风险' + risk + '。',
  };
}

/** 把天气折算为探索修正：风险倍率与收益倍率。 */
export function modifiers(input = {}) {
  const w = forecast(input);
  return {
    // 带上天气标识：调用方（expedition 日志、事件影响）需要知道"是什么天气"，
    // 若只回倍率，日志里就会出现「外出 6 小时，，辐射较强」这种空档。
    kind: w.kind,
    name: w.name,
    severity: w.severity,
    riskMultiplier: 1 + w.severity * 2,
    yieldMultiplier: Math.max(0.15, w.light),
    shelterStress: w.shelterStress,
  };
}
