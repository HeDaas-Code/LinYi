import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as weather from '../src/survival/environment/weather.js';
import * as radiation from '../src/survival/environment/radiation.js';
import * as expedition from '../src/survival/environment/expedition.js';
import * as rng from '../src/infra/rng.js';

// ---- weather ----

test('weather: 预报在持续期内稳定，到期后按转移表切换', () => {
  rng.seed('w1');
  weather.__reset();
  const a = weather.forecast({ tick: 1 });
  assert.ok(a.kind, '应有天气档位');
  assert.ok(a.daysLeft >= 1, '应有持续天数');
  // 同一持续期内多次预报应完全一致（预报因此才有信息价值）
  const b = weather.forecast({ tick: 1 });
  assert.deepEqual({ ...b, tick: 1 }, { ...a, tick: 1 }, '持续期内预报应稳定');
  // 推进足够多天必然切换
  let kinds = new Set();
  for (let i = 0; i < 60; i += 1) kinds.add(weather.strike({ tick: i, applyStress: false }).kind);
  assert.ok(kinds.size >= 2, '60 天内应出现多种天气，实际 ' + kinds.size);
});

test('weather: 同种子可复现，modifiers 随 severity 单调', () => {
  rng.seed('w2'); weather.__reset();
  const seq1 = Array.from({ length: 20 }, (_, i) => weather.strike({ tick: i, applyStress: false }).kind);
  rng.seed('w2'); weather.__reset();
  const seq2 = Array.from({ length: 20 }, (_, i) => weather.strike({ tick: i, applyStress: false }).kind);
  assert.deepEqual(seq1, seq2, '同种子天气序列应逐位一致');

  rng.seed('w3'); weather.__reset();
  weather.forecast({ force: true });
  const m = weather.modifiers({});
  assert.ok(m.riskMultiplier >= 1, '风险倍率应 ≥1');
  assert.ok(m.yieldMultiplier > 0 && m.yieldMultiplier <= 1, '收益倍率应在 (0,1]');
});

test('weather: strike 按 shelterStress 施加压力，晴/阴不施压', () => {
  // 注意 severity 与 shelterStress 是**正交**的两件事：阴天有轻微探索风险（severity 0.1）
  // 但不对避难所外壳施压（shelterStress 0）。测试必须按 shelterStress 判定，不能按 severity。
  rng.seed('w4'); weather.__reset();
  let total = 0; let stressed = 0;
  for (let i = 0; i < 40; i += 1) {
    const dmg = [];
    const r = weather.strike({ tick: i, shelter: { damage: (a) => dmg.push(a) } });
    if (r.shelterStress > 0) {
      assert.equal(dmg.length, 1, r.kind + ' 有外壳压力应调用一次 damage');
      assert.equal(dmg[0], r.shelterStress, '施加量应等于 shelterStress');
      stressed += 1;
    } else {
      assert.equal(dmg.length, 0, r.kind + ' 无外壳压力不应调用 damage');
    }
    total += r.severity;
  }
  assert.ok(stressed > 0, '40 天内应出现施压天气');
  assert.ok(total > 0, '40 天内应累计出探索风险');
});

// ---- radiation ----

test('radiation: 避难所格恒为 0，且场有结构（非均匀）', () => {
  rng.seed('r1'); radiation.__reset();
  radiation.configure({ size: 8 });
  const shelter = radiation.query({ safe: true });
  assert.equal(shelter.intensity, 0, '避难所内强度应为 0');
  assert.equal(radiation.query({ x: 0, y: 0 }).intensity, 0, '避难所格本身应为 0');
  const f = radiation.field();
  assert.equal(f.length, 8);
  const vals = f.flat();
  assert.ok(Math.max(...vals) > 0, '场中应有辐射热点');
  assert.ok(new Set(vals.map((v) => v.toFixed(2))).size > 3, '场应非均匀');
});

test('radiation: 扩散使总量平滑下降且避难所仍为 0', () => {
  rng.seed('r2'); radiation.__reset();
  radiation.configure({ size: 8 });
  const before = radiation.field().flat().reduce((a, b) => a + b, 0);
  const r = radiation.spread({ steps: 3 });
  assert.ok(before > 0, '扩散前应有辐射');
  assert.ok(r.totalAfter < before, '扩散+衰减后总量应下降');
  assert.equal(radiation.query({ x: 0, y: 0 }).intensity, 0, '扩散后避难所格仍应为 0');
});

test('radiation: 剂量随强度、时长上升，随防护下降', () => {
  rng.seed('r3'); radiation.__reset();
  radiation.configure({ size: 8 });
  const spot = (() => {
    const f = radiation.field();
    let best = { x: 1, y: 1, v: 0 };
    for (let y = 0; y < f.length; y += 1) for (let x = 0; x < f[y].length; x += 1) if (f[y][x] > best.v) best = { x, y, v: f[y][x] };
    return best;
  })();
  const d1 = radiation.dose({ x: spot.x, y: spot.y, hours: 2, protection: 0 });
  const d2 = radiation.dose({ x: spot.x, y: spot.y, hours: 6, protection: 0 });
  const d3 = radiation.dose({ x: spot.x, y: spot.y, hours: 6, protection: 0.5 });
  assert.ok(d2.dose > d1.dose, '更长暴露应更高剂量');
  assert.ok(d3.dose < d2.dose, '防护应降低剂量');
  assert.ok(d3.dose > 0, '防护不应把剂量清零');
});

// ---- expedition ----

test('expedition: plan 是纯读的，且风险随距离/辐射/恶劣状态上升', () => {
  rng.seed('e1'); radiation.__reset(); weather.__reset();
  radiation.configure({ size: 8 });
  const near = expedition.plan({ range: 'near', tags: [], needs: { food: 0, water: 0 }, health: 1 });
  const far = expedition.plan({ range: 'far', tags: [], needs: { food: 0, water: 0 }, health: 1 });
  assert.ok(far.risk > near.risk, '更远的目标应更高风险');
  assert.ok(far.expectedLootCount >= near.expectedLootCount, '更远的目标应至少不更少收益');

  const healthy = expedition.plan({ range: 'mid', tags: ['resilient'], needs: { food: 0, water: 0 }, health: 1 });
  const starving = expedition.plan({ range: 'mid', tags: ['resilient'], needs: { food: 0.9, water: 0.9 }, health: 0.3 });
  assert.ok(starving.risk > healthy.risk, '恶劣生存状态应抬高风险');
  assert.equal(starving.viable, false, '过度饥饿/脱水时不应可行');
  assert.ok(starving.reasons.length > 0, '不可行应给出原因');
});

test('expedition: 特质显著影响风险（谨慎降低、鲁莽抬高）', () => {
  rng.seed('e2'); radiation.__reset(); weather.__reset();
  radiation.configure({ size: 8 });
  const base = expedition.plan({ range: 'mid', tags: [], needs: {}, health: 1 });
  const cautious = expedition.plan({ range: 'mid', tags: ['cautious'], needs: {}, health: 1 });
  const reckless = expedition.plan({ range: 'mid', tags: ['reckless'], needs: {}, health: 1 });
  assert.ok(cautious.risk < base.risk, '谨慎应降低风险');
  assert.ok(reckless.risk > base.risk, '鲁莽应抬高风险');
  assert.ok(cautious.traitLabels.includes('谨慎'), '应记录生效的特质');
});

test('expedition: execute 是确定性的，且后果严重度与收益反向', () => {
  rng.seed('e3'); radiation.__reset(); weather.__reset();
  radiation.configure({ size: 8 });
  const p = expedition.plan({ range: 'mid', tags: [], needs: {}, health: 1 });

  rng.seed('e3x');
  const r1 = expedition.execute({ plan: p });
  rng.seed('e3x');
  const r2 = expedition.execute({ plan: p });
  assert.deepEqual(r1, r2, '同种子同计划应逐位一致');

  // 统计：更严重的后果平均拾获更少
  const byOutcome = {};
  for (let i = 0; i < 400; i += 1) {
    const r = expedition.execute({ plan: p });
    (byOutcome[r.outcome] = byOutcome[r.outcome] || []).push(r.loot.reduce((a, x) => a + x.quantity, 0));
  }
  assert.ok(byOutcome.clean && byOutcome.clean.length > 0, '应出现顺利归来');
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  if (byOutcome.lost && byOutcome.lost.length > 0) {
    assert.ok(avg(byOutcome.clean) > avg(byOutcome.lost), '顺利归来应比失联拾获更多');
  }
  assert.ok(byOutcome.clean.length + (byOutcome.scathed?.length ?? 0) > 0, '应有成功结局');
});

test('expedition: 高风险不等于零期望——失败仍可能带回部分物资', () => {
  rng.seed('e4'); radiation.__reset(); weather.__reset();
  radiation.configure({ size: 8 });
  const p = expedition.plan({ range: 'far', tags: ['reckless'], needs: {}, health: 1 });
  let totalLoot = 0; let n = 0;
  for (let i = 0; i < 300; i += 1) {
    const r = expedition.execute({ plan: p });
    totalLoot += r.loot.reduce((a, x) => a + x.quantity, 0);
    n += 1;
  }
  assert.ok(totalLoot / n > 0, '高风险探索的平均拾获应大于 0（否则理性居民永不探索）');
});

test('expedition: settle 只产生日志+资源+状态变化，且满包优雅降级', () => {
  rng.seed('e5'); radiation.__reset(); weather.__reset();
  radiation.configure({ size: 8 });
  const p = expedition.plan({ agentId: 'a1', range: 'mid', tags: [], needs: {}, health: 1 });

  const added = []; const logs = []; const injures = []; const needUpdates = [];
  const r = expedition.settle({
    agentId: 'a1',
    plan: p,
    result: expedition.execute({ plan: p }),
    backpack: { add: (x) => { added.push(x); } },
    health: { injure: (x) => { injures.push(x); } },
    needs: { update: (x) => { needUpdates.push(x); } },
    chronicle: (x) => { logs.push(x); },
  });
  assert.match(r.log, /探索/, '日志应描述探索');
  assert.equal(logs.length, 1, '应写入一条编年史');
  assert.equal(logs[0].kind, 'expedition');
  assert.ok(added.length === r.changes.loot.length, '拾获应逐一入包');
  assert.ok(r.changes.healthLoss >= 0 && r.changes.healthLoss <= 1);
  assert.equal(r.changes.rejected.length, 0, '正常背包不应有拒绝');

  // 满包：不抛错，记为 rejected
  const r2 = expedition.settle({
    agentId: 'a1', plan: p,
    result: { outcome: 'clean', roll: 0, risk: 0, loot: [{ itemId: 'scrap', name: '废金属', quantity: 3 }], dose: 0, healthLoss: 0, staminaCost: 0, hours: 6, range: 'mid' },
    backpack: { add: () => { throw new RangeError('超出容量'); } },
  });
  assert.equal(r2.changes.loot.length, 0, '满包时不应记录为已拾获');
  assert.equal(r2.changes.rejected.length, 1, '满包应记录为被拒');
  assert.match(r2.log, /背包已满/, '日志应说明丢弃原因');

  assert.throws(() => expedition.settle({}), /非空 agentId/);
});
