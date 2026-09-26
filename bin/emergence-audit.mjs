/**
 * truman-town 涌现审查 / Emergence audit
 *
 *   node bin/emergence-audit.mjs [--seeds 1,2,3] [--agents 50] [--ticks 200] [--json out.json]
 *
 * 目的：把「多智能体涌现决策」从一句主张变成可复核的数字。
 * 审查四件事：
 *   ① 非退化 —— 行动分布不能塌缩到一两个行动（否则等于单脚本）；
 *   ② 个体分叉 —— 同一 tick、同一主导压力的居民应做出不同选择；
 *   ③ 跨种子分叉 —— 换随机种子世界应真的不一样（可复现但不唯一）；
 *   ④ 生命周期量 —— 用累计发生/消亡次数而不是存量来观察演化。
 * 同时输出编年志可读性抽样（内容校验）。
 */

import * as loop from '../src/runtime/orchestrator/loop.js';
import * as observer from '../src/observer/index.js';
import * as social from '../src/social/index.js';
import * as civilization from '../src/civilization/index.js';

const argOf = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const seeds = String(argOf('seeds', '1,2,3')).split(',').map((s) => Number(s.trim()));
const agents = Number(argOf('agents', '50'));
const ticks = Number(argOf('ticks', '200'));
const jsonOut = argOf('json', null);

const entropy = (counts) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of Object.values(counts)) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h;
};

const l1 = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  let ta = 0;
  let tb = 0;
  for (const k of keys) { ta += a[k] ?? 0; tb += b[k] ?? 0; }
  if (ta === 0 || tb === 0) return 0;
  for (const k of keys) sum += Math.abs((a[k] ?? 0) / ta - (b[k] ?? 0) / tb);
  return sum / 2;
};

const topPressure = (context) => {
  const ps = context?.pressures;
  if (!Array.isArray(ps) || ps.length === 0) return 'none';
  let best = ps[0];
  for (const p of ps) if ((p.level ?? 0) > (best.level ?? 0)) best = p;
  return String(best.id ?? best.need ?? 'none');
};

const rows = [];
for (const seed of seeds) {
  loop.reset();
  const report = await loop.run({ agentCount: agents, ticks, seed, phase2: true, phase3: true });

  const dist = {};
  for (const st of (report.steps ?? [])) {
    for (const d of (st.decisions ?? [])) dist[d.action] = (dist[d.action] ?? 0) + 1;
  }

  const logs = observer.recorder.decisionLog.list();
  const perTick = new Map();
  const perGroup = new Map();
  const reasons = new Set();
  for (const n of logs) {
    const t = n.data.tick;
    if (!perTick.has(t)) perTick.set(t, new Set());
    perTick.get(t).add(n.data.decision);
    const key = t + '|' + topPressure(n.data.context);
    if (!perGroup.has(key)) perGroup.set(key, new Set());
    perGroup.get(key).add(n.data.decision);
    if (typeof n.data.reason === 'string') reasons.add(n.data.reason);
  }
  let multiTick = 0;
  for (const s of perTick.values()) if (s.size >= 2) multiTick += 1;
  let multiGroup = 0;
  for (const s of perGroup.values()) if (s.size >= 2) multiGroup += 1;

  const aliveOf = (rep) => {
    const wa = rep.world.agents ?? {};
    let n = 0;
    for (const id of rep.agents.map((x) => x.id)) {
      const rec = wa[id];
      if (rec && rec.alive !== false) n += 1;
    }
    return n;
  };

  const families = social.family.registry.list();
  const gen = {};
  for (const f of families) {
    const g = social.family.lineage.generation({ familyId: f.familyId ?? f.id });
    gen[f.familyId ?? f.id] = g?.maxGeneration ?? g ?? 0;
  }
  const traits = {};
  for (const f of families) {
    const id = f.familyId ?? f.id;
    traits[id] = (social.family.trait.enforcer.list(id) ?? []).length;
  }

  const evTopics = new Set(observer.recorder.eventLog.list().map((n) => String(n.data.topic)));
  const posts = social.platform.posts.list();

  rows.push({
    seed,
    alive: aliveOf(report),
    agents: report.agents.length,
    worldPopulation: Object.keys(report.world.agents ?? {}).length,
    ticks,
    finalTick: report.finalTick,
    dist,
    actionCount: Object.keys(dist).length,
    entropy: entropy(dist),
    maxEntropy: Math.log(Object.keys(dist).length || 1),
    distinctPerTickMean: perTick.size ? [...perTick.values()].reduce((a, s) => a + s.size, 0) / perTick.size : 0,
    tickMultiActionRatio: perTick.size ? multiTick / perTick.size : 0,
    groupMultiActionRatio: perGroup.size ? multiGroup / perGroup.size : 0,
    groupCount: perGroup.size,
    uniqueReasons: reasons.size,
    decisionLogCount: logs.length,
    summary: report.phase2.summary,
    phase3: report.phase3?.summary ?? null,
    families: families.length,
    familyGenerations: gen,
    familyTraitCounts: traits,
    eventTopicCount: evTopics.size,
    postCount: posts.length,
    distinctPostBodies: new Set(posts.map((p) => p.content)).size,
  });
}

const out = {
  config: { seeds, agents, ticks },
  rows,
  crossSeedL1: (() => {
    const res = [];
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        res.push({ pair: rows[i].seed + 'vs' + rows[j].seed, l1: l1(rows[i].dist, rows[j].dist) });
      }
    }
    return res;
  })(),
};

if (jsonOut) {
  const fs = await import('node:fs');
  fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2));
}

const pct = (v) => (v * 100).toFixed(1) + '%';
for (const r of rows) {
  console.log('===== seed ' + r.seed + ' =====');
  console.log('存活 ' + r.alive + '/' + r.agents + '（初始居民）  世界人口=' + r.worldPopulation
    + '  最终 tick=' + r.finalTick
    + '  决策日志=' + r.decisionLogCount + '（初始居民 ' + r.agents * r.ticks + ' + 子代）');
  console.log('行动种类=' + r.actionCount
    + '  归一化熵=' + (r.entropy / r.maxEntropy).toFixed(3)
    + '  每 tick 平均不同行动=' + r.distinctPerTickMean.toFixed(2)
    + '  多行动 tick 占比=' + pct(r.tickMultiActionRatio));
  console.log('同主导压力下出现分叉的组占比=' + pct(r.groupMultiActionRatio) + '（组数=' + r.groupCount + '）');
  console.log('决策解释去重条数=' + r.uniqueReasons);
  console.log('行动分布=' + JSON.stringify(r.dist));
  const s = r.summary;
  console.log('生命周期：累计创办=' + s.businessesFounded + ' 存活企业=' + s.businesses
    + ' 破产=' + s.bankruptcies + ' 出生=' + s.childrenBorn
    + ' 交易=' + s.trades + ' 制作=' + s.crafted + ' 建造=' + s.built
    + ' 治疗=' + s.treated + ' 工资=' + Math.round(s.wagesPaid)
    + ' 放贷=' + Math.round(s.creditIssued) + ' 利息=' + Math.round(s.interestAccrued));
  console.log('社会：帖子=' + r.postCount + ' 不同正文=' + r.distinctPostBodies
    + ' 家庭=' + r.families + ' 家族代数=' + JSON.stringify(r.familyGenerations)
    + ' 家族特质数=' + JSON.stringify(r.familyTraitCounts));
  console.log('事件主题种类=' + r.eventTopicCount);
  if (r.phase3) console.log('phase3=' + JSON.stringify(r.phase3).slice(0, 300));
}
console.log('');
console.log('===== 跨种子分叉（行动分布 L1 距离，0=完全相同，1=完全不相交） =====');
for (const c of out.crossSeedL1) console.log('  ' + c.pair + ' -> ' + c.l1.toFixed(4));
