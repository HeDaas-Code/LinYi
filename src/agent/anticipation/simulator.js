/**
 * truman-town.agent.anticipation.simulator — 行动模拟 / Action Simulator
 *
 * 对候选行动做"简化推演"——不实现开放世界或地图寻路，只做数值/状态推演：
 * 给定当前需求与资源，估算行动后的需求变化（needsDelta）、资源收益（resourceGain）
 * 与风险（risk），并叠加一个探索扰动（exploration），输出期望效用
 *（expectedUtility）。"探索"被简化为各方因素与随机数综合计算的结果。
 *
 * 探索扰动使用本地确定性哈希（seed + agentId + tick + action），不消耗全局
 * rng 序列——避免决策层扰动意外影响生存事件 / 经济 / 社会等其他子系统的随机流。
 */

function hash01(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const ACTION_EFFECTS = Object.freeze({
  eat: Object.freeze({ food: -0.5, water: 0, risk: 0 }),
  drink: Object.freeze({ food: 0, water: -0.5, risk: 0 }),
  rest: Object.freeze({ food: -0.1, water: -0.1, risk: 0 }),
  forage: Object.freeze({ food: 0, water: 0, risk: 0.15, gain: true }),
});

function clampUnit(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function needRelief(effects, needs) {
  let relief = 0;
  for (const need of ['food', 'water']) {
    const delta = effects[need] ?? 0;
    if (delta < 0) relief += -delta * clampUnit(needs[need]);
  }
  return relief;
}

export function simulate(candidate, context = {}) {
  const effects = ACTION_EFFECTS[candidate?.action] ?? { food: 0, water: 0, risk: 0 };
  const needs = context.needs ?? {};
  const resources = context.resources ?? {};

  const relief = needRelief(effects, needs);

  let resourceGain = 0;
  if (effects.gain) {
    const foodScarcity = clampUnit(resources.food?.scarcity);
    const waterScarcity = clampUnit(resources.water?.scarcity);
    resourceGain = 0.8 * Math.max(foodScarcity, waterScarcity);
  }

  const risk = effects.risk ?? 0;
  const noise = typeof context.noise === 'number' && context.noise >= 0 ? context.noise : 0.25;
  const key = [context.seed, context.agentId, context.tick, candidate?.action].join(':');
  const exploration = noise === 0 ? 0 : (hash01(key) * 2 - 1) * noise;

  const expectedUtility = relief + resourceGain - risk + exploration;

  return {
    candidate,
    action: candidate?.action,
    expectedUtility,
    needsDelta: { food: effects.food ?? 0, water: effects.water ?? 0 },
    resourceGain,
    risk,
    exploration,
  };
}

export function predict(agentId, candidates, context = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const out = list.map((candidate) => simulate(candidate, { ...context, agentId }));
  out.sort((a, b) => {
    if (b.expectedUtility !== a.expectedUtility) return b.expectedUtility - a.expectedUtility;
    const aid = String(a.candidate?.id ?? '');
    const bid = String(b.candidate?.id ?? '');
    return aid < bid ? -1 : aid > bid ? 1 : 0;
  });
  return out;
}

export function __reset() {}
