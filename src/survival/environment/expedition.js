/**
 * truman-town.survival.environment.expedition — 探索结算。
 *
 * **核心契约（用户明确要求，勿改）**：探索是**一次计算**，不是开放世界。
 * 综合辐射、天气、物资、装备、特质、生存状态与随机数，得出一个结果；
 * 结果只体现为「一段日志 + 资源变化 + Agent 状态变化」。
 * 没有地图漫游、没有寻路、没有逐格移动。
 *
 * 设计取舍：
 * - **三阶段分离**：plan（评估条件与预期）→ execute（掷骰结算）→ settle（落地变化）。
 *   分开的原因是可观测与可测试：plan 可被居民作为决策依据（"今天值不值得出去"），
 *   execute 是纯函数式的结算（只读随机数），settle 才是唯一产生副作用的步骤。
 * - **风险与收益同向**：走得更远（目标格辐射更高）收益更大，剂量也更高。
 *   否则探索会退化成"无脑走远"，失去权衡。
 * - **失败不等于空手而归**：失败会受伤/中毒/丢失装备，但通常仍有部分拾获，
 *   使"高风险探索"在期望值上仍然有吸引力（否则理性居民永不探索）。
 * - **一切经由 infra.rng**：同种子同输入 → 同结果，保证沙盘可复现。
 */

import * as rng from '../../infra/rng.js';
import * as radiation from './radiation.js';
import * as weather from './weather.js';

/** 探索目标距离档位。 */
export const RANGES = Object.freeze({
  near: Object.freeze({ id: 'near', name: '近郊', hours: 3, riskBase: 0.05, yieldBase: 1.0, radius: 1 }),
  mid: Object.freeze({ id: 'mid', name: '外围', hours: 6, riskBase: 0.18, yieldBase: 2.2, radius: 3 }),
  far: Object.freeze({ id: 'far', name: '废墟深处', hours: 10, riskBase: 0.35, yieldBase: 4.0, radius: 5 }),
});

/**
 * 探索可获得的物资产出表。
 * `key` 是**语义键**（scrap/cloth/...），不是物品目录 id——目录 id 由调用方
 * （主循环 define 时生成）注入，避免本模块硬编码一个它无权决定的 id。
 * 若调用方未注入映射，则 key 直接作为 itemId（便于独立测试）。
 */
const LOOT_TABLE = Object.freeze([
  Object.freeze({ key: 'scrap', name: '废金属', min: 1, max: 4, weight: 5 }),
  Object.freeze({ key: 'cloth', name: '布料', min: 1, max: 3, weight: 4 }),
  Object.freeze({ key: 'circuit', name: '电路板', min: 1, max: 2, weight: 2 }),
  Object.freeze({ key: 'medicine', name: '药品', min: 1, max: 2, weight: 2 }),
  Object.freeze({ key: 'seed', name: '种子', min: 1, max: 3, weight: 3 }),
  Object.freeze({ key: 'fuel', name: '燃料', min: 1, max: 2, weight: 2 }),
]);

/** 从特质标签里提取探索相关的加成（标签名 → 效果）。 */
const TRAIT_EFFECTS = Object.freeze({
  resilient: Object.freeze({ risk: -0.12, label: '强韧' }),
  cautious: Object.freeze({ risk: -0.18, yield: -0.1, label: '谨慎' }),
  curious: Object.freeze({ yield: 0.2, risk: 0.06, label: '好奇' }),
  hardworking: Object.freeze({ yield: 0.12, label: '勤勉' }),
  frail: Object.freeze({ risk: 0.15, label: '孱弱' }),
  reckless: Object.freeze({ risk: 0.2, yield: 0.25, label: '鲁莽' }),
});

function pickLoot(count, idMap = null) {
  const items = [];
  const total = LOOT_TABLE.reduce((s, e) => s + e.weight, 0);
  for (let i = 0; i < count; i += 1) {
    let r = rng.next() * total;
    let chosen = LOOT_TABLE[LOOT_TABLE.length - 1];
    for (const e of LOOT_TABLE) { r -= e.weight; if (r <= 0) { chosen = e; break; } }
    const qty = chosen.min + Math.floor(rng.next() * (chosen.max - chosen.min + 1));
    const itemId = (idMap && typeof idMap[chosen.key] === 'string') ? idMap[chosen.key] : chosen.key;
    const prior = items.find((x) => x.itemId === itemId);
    if (prior) prior.quantity += qty;
    else items.push({ itemId, key: chosen.key, name: chosen.name, quantity: qty });
  }
  return items;
}

/**
 * 目标距离环形带上的平均辐射强度。
 * 在半径 [max(1, r-1), r+1] 的环带上均匀采样若干点取均值——
 * 这表达的是"走这么远，平均会遇到多强的辐射"，而不是某个特定格子的值。
 */
function ringMeanRadiation(radius) {
  const inner = Math.max(1, radius - 1);
  const outer = radius + 1;
  let sum = 0; let n = 0;
  for (let a = 0; a < 8; a += 1) {
    const theta = (a / 8) * Math.PI * 2;
    for (let d = inner; d <= outer; d += 1) {
      const x = Math.round(Math.cos(theta) * d);
      const y = Math.round(Math.sin(theta) * d);
      const q = radiation.query({ x, y });
      if (q.outOfBounds) continue;
      sum += q.intensity; n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

function traitModifiers(tags) {
  const list = Array.isArray(tags) ? tags : [];
  let risk = 0; let yieldBonus = 0;
  const applied = [];
  for (const t of list) {
    const e = TRAIT_EFFECTS[t];
    if (!e) continue;
    risk += e.risk ?? 0;
    yieldBonus += e.yield ?? 0;
    applied.push(e.label);
  }
  return { risk, yield: yieldBonus, applied };
}

/**
 * 评估一次探索的条件、风险与预期收益。
 * 纯读操作，不改动任何状态——居民可用它作为「今天值不值得出去」的判断依据。
 *
 * @param {{ agentId?: string, range?: string, tags?: string[],
 *           needs?: {food?: number, water?: number}, health?: number,
 *           foodStock?: number, waterStock?: number, weatherMods?: object,
 *           gear?: string[] }} input
 */
export function plan(input = {}) {
  const range = RANGES[input.range] ?? RANGES.near;
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const tm = traitModifiers(tags);
  const needs = input.needs ?? {};
  const hunger = Math.max(0, Math.min(1, needs.food ?? 0));
  const thirst = Math.max(0, Math.min(1, needs.water ?? 0));
  const health = typeof input.health === 'number' ? Math.max(0, Math.min(1, input.health)) : 1;

  // 辐射：在目标距离的"环形带"上采样，取**均值**作为该距离的辐射水平。
  // 不能用固定角标（原实现硬编码 (radius, radius)）——那只是地图上的一个点，
  // 与"这个距离带整体有多危险"无关，且该点恰好落在热点上时会给出失真的高风险。
  const radRisk = ringMeanRadiation(range.radius);
  const wm = input.weatherMods ?? weather.modifiers({});

  // 装备减伤：每件探索向装备提供 0.08 防护，上限 0.4。
  const gear = Array.isArray(input.gear) ? input.gear : [];
  const protection = Math.min(0.4, gear.length * 0.08);

  // 生存状态不佳会显著抬高风险——饿着肚子出去是找死。
  const survivalPenalty = hunger * 0.3 + thirst * 0.35 + (1 - health) * 0.4;

  const risk = Math.max(0, Math.min(0.95,
    range.riskBase * wm.riskMultiplier
    + radRisk * 0.5
    + survivalPenalty
    + tm.risk
    - protection * 0.5));

  // 收益 = 距离基准 × 天气能见度 × 特质加成 × 风险折扣。
  // 风险折扣刻意**温和**（最低保留 55%）：风险已经通过后果判定（clean/scathed/injured/lost）
  // 单独惩罚一次，若这里再把收益乘到接近 0，就等于对风险重复惩罚两遍，
  // 「高风险高收益」的权衡随之消失，探索变成纯亏损的坏选择。
  const expectedYieldMultiplier = Math.max(0.55, range.yieldBase * wm.yieldMultiplier * (1 + tm.yield) * (1 - risk * 0.25));
  // 拾获数量至少为 1：只要出了门，就不该必然空手而归（否则居民无从学习"探索有意义"）。
  const lootCount = Math.max(1, Math.round(expectedYieldMultiplier));

  // 可行性：饿/渴到临界时不该出行；避难所储备见底时外出反而是必要的（允许）。
  const viable = hunger < 0.85 && thirst < 0.85 && health > 0.15;

  const reasons = [];
  if (hunger >= 0.85) reasons.push('过度饥饿');
  if (thirst >= 0.85) reasons.push('严重脱水');
  if (health <= 0.15) reasons.push('伤势过重');
  if (radRisk > 0.6) reasons.push('目标区域辐射极高');
  if (wm.riskMultiplier > 2) reasons.push('天气恶劣');

  return {
    agentId: input.agentId ?? null,
    range: range.id,
    rangeName: range.name,
    hours: range.hours,
    risk,
    radRisk,
    protection,
    survivalPenalty,
    traitLabels: tm.applied,
    // 天气名（供日志）。modifiers() 若带了 kind 就用它，否则回落到 weather.forecast()。
    weatherKind: wm.kind ?? weather.forecast({}).kind ?? null,
    weatherName: wm.name ?? weather.forecast({}).name ?? null,
    expectedLootCount: lootCount,
    expectedYieldMultiplier,
    viable,
    reasons,
  };
}

/**
 * 掷骰结算。纯函数式：只读 rng，不产生任何副作用。
 * @param {{ plan?: object, seedOffset?: number }} input
 */
export function execute(input = {}) {
  const p = input.plan ?? plan({});
  const risk = Math.max(0, Math.min(1, p.risk ?? 0));

  // 后果判定：一次均匀掷骰对应风险阈值。
  const roll = rng.next();
  let outcome;
  if (roll >= risk + 0.12) outcome = 'clean';       // 无伤而归
  else if (roll >= risk) outcome = 'scathed';       // 有所获但受伤
  else if (roll >= risk * 0.45) outcome = 'injured'; // 明显受伤/中毒
  else outcome = 'lost';                            // 迷路/重伤，几乎空手

  // 收益：成功度越高，拾获越多；失败仍有部分拾获（保证期望值为正）。
  const yieldFactor = outcome === 'clean' ? 1.0
    : outcome === 'scathed' ? 0.75
      : outcome === 'injured' ? 0.45
        : 0.2;
  const lootCount = Math.max(0, Math.round((p.expectedLootCount ?? 0) * yieldFactor));
  const loot = pickLoot(lootCount, input.itemIds ?? null);

  // 代价：剂量与身体损耗随后果加重。
  const doseMult = outcome === 'clean' ? 0.6 : outcome === 'scathed' ? 1.0 : outcome === 'injured' ? 1.5 : 1.9;
  const dose = (p.radRisk ?? 0) * (p.hours ?? 3) * (1 - (p.protection ?? 0)) * doseMult;
  const healthLoss = Math.max(0, Math.min(1, (p.risk ?? 0) * 0.5 * doseMult));
  const staminaCost = (p.hours ?? 3) * 0.04 * doseMult;

  return { outcome, roll, risk, loot, dose, healthLoss, staminaCost, hours: p.hours ?? 3, range: p.range ?? 'near' };
}

/** 后果的严重度序（供日志与测试比较）。 */
const SEVERITY = Object.freeze({ clean: 0, scathed: 1, injured: 2, lost: 3 });

/**
 * 把探索结果落为**日志 + 资源变化 + Agent 状态变化**。
 * 这是唯一产生副作用的步骤。
 *
 * @param {{ agentId: string, result?: object, plan?: object,
 *           backpack?: { add: Function }, medical?: { produce: Function },
 *           needs?: { update: Function }, health?: { injure?: Function },
 *           chronicle?: Function }} ctx
 */
export function settle(ctx = {}) {
  const agentId = ctx.agentId;
  if (typeof agentId !== 'string' || agentId === '') {
    throw new TypeError('expedition.settle: 需要非空 agentId');
  }
  const result = ctx.result ?? execute({ plan: ctx.plan });
  const p = ctx.plan ?? plan({ agentId });
  const changes = { loot: [], dose: result.dose, healthLoss: 0, staminaCost: result.staminaCost, rejected: [] };

  // 1) 拾获入背包。满包不是错误——记录被拒数量，探索仍然发生了。
  if (ctx.backpack && typeof ctx.backpack.add === 'function') {
    for (const item of result.loot) {
      try {
        ctx.backpack.add({ agentId, itemId: item.itemId, quantity: item.quantity });
        changes.loot.push(item);
      } catch (err) {
        // 必须区分两类失败：容量不足是**预期内**的降级，而「未定义的物品」
        // 是**配置错误**，把它混报成"背包已满"会把诊断引向完全错误的方向
        //（实测：探索 285 次全报"装不下"，真因是掉落物从未注册进物品目录）。
        const msg = err && err.message ? err.message : String(err);
        const isCapacity = /容量|负重|capacity|maxWeight/.test(msg);
        if (!isCapacity) changes.configErrors = (changes.configErrors ?? []).concat(msg);
        changes.rejected.push({
          itemId: item.itemId, quantity: item.quantity,
          reason: isCapacity ? '背包已满' : '物资未注册：' + msg.slice(0, 60),
        });
      }
    }
  } else {
    changes.loot = result.loot.slice();
  }

  // 2) 身体损耗落到健康模块（若可用）。
  if (result.healthLoss > 0 && ctx.health && typeof ctx.health.injure === 'function') {
    try {
      ctx.health.injure({ agentId, amount: result.healthLoss });
      changes.healthLoss = result.healthLoss;
    } catch { changes.healthLoss = 0; }
  } else {
    changes.healthLoss = result.healthLoss;
  }

  // 3) 疲劳落到需求表（饥饿/口渴/体力）。
  if (ctx.needs && typeof ctx.needs.update === 'function') {
    try {
      ctx.needs.update({ agentId, deltas: { food: result.staminaCost * 0.5, water: result.staminaCost * 0.6 } });
    } catch { /* 需求表不可用时静默跳过 */ }
  }

  // 4) 辐射污染药品储备的消耗：剂量越高，对医疗资源的需求越大（由调用方决定是否扣减）。

  // 5) 日志：一段人类可读的叙事。
  const outcomeText = { clean: '顺利归来', scathed: '负伤而归', injured: '重伤撤回', lost: '几乎失联' }[result.outcome];
  // 措辞必须与事实一致：拾到但装不下 ≠ 一无所获。旧写法会出现
  // 「拾获 一无所获。（背包已满，丢弃 1 类物资）」这种自相矛盾的日志。
  const lootText = changes.loot.length > 0
    ? changes.loot.map((i) => i.name + '×' + i.quantity).join('、')
    : (changes.rejected.length > 0 ? '有拾获但装不下' : '一无所获');
  const log = '【' + p.rangeName + '探索】' + agentId + ' 外出 ' + result.hours + ' 小时，'
    + (p.weatherName ? p.weatherName + '天' : '天气不明') + (p.radRisk > 0.3 ? '，辐射较强' : '') + '。'
    + '结果：' + outcomeText + '，拾获 ' + lootText + '。'
    + (changes.healthLoss > 0 ? '身体损失 ' + changes.healthLoss.toFixed(2) + '。' : '身体无损。')
    + (changes.rejected.length > 0 ? '（背包已满，只能放弃 ' + changes.rejected.length + ' 类物资）' : '');
  if (typeof ctx.chronicle === 'function') {
    try {
      ctx.chronicle({ agentId, kind: 'expedition', text: log, payload: { ...changes, outcome: result.outcome, range: result.range } });
    } catch { /* 观察者不可用时不影响结算 */ }
  }

  return { agentId, outcome: result.outcome, severity: SEVERITY[result.outcome], log, changes };
}
