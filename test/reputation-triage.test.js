import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rankTriageByReputation } from '../src/runtime/orchestrator/_stage2.js';
import * as loop from '../src/runtime/orchestrator/loop.js';

// t56：声誉分诊反馈修复（f2）——制造稀缺 + 强化声誉信号，使声誉排序真实影响“谁被治疗”。

test('rankTriageByReputation: 声誉显著时改变排序（高声誉优先）', () => {
  const patients = [
    { agentId: 'low', severity: 0.6 },
    { agentId: 'high', severity: 0.4 },
  ];
  const scoreOf = (id) => ({ low: 20, high: 90 }[id] ?? 50);
  const ordered = rankTriageByReputation(patients, scoreOf, 1.0);
  assert.deepEqual(ordered.map((p) => p.agentId), ['high', 'low']);
});

test('rankTriageByReputation: 声誉中性时保持严重度降序', () => {
  const patients = [
    { agentId: 'a', severity: 0.3 },
    { agentId: 'b', severity: 0.7 },
  ];
  const ordered = rankTriageByReputation(patients, () => 50, 1.0);
  assert.deepEqual(ordered.map((p) => p.agentId), ['b', 'a']);
});

test('t56 消融：声誉分诊开/关在疫情种子下产生可观测差异（排序交换 + 被治疗者声誉构成）', async () => {
  const on = await loop.run({ agentCount: 50, ticks: 200, seed: 2, phase2: true });
  const off = await loop.run({ agentCount: 50, ticks: 200, seed: 2, phase2: true, reputationTriageEnabled: false });
  const so = on.phase2.summary;
  const sf = off.phase2.summary;
  assert.ok(so.reputationTriageSwaps > 0, '开启声誉分诊应产生排序交换（不再恒 0）');
  assert.equal(sf.reputationTriageSwaps, 0, '关闭声誉分诊不应产生排序交换');
  assert.notEqual(
    so.reputationTriageTreatedScore,
    sf.reputationTriageTreatedScore,
    '开/关声誉分诊时被治疗者的声誉构成应不同',
  );
});

test('t56 约束：seed 1 平台指标不变 + 声誉→信贷路径保留 + 存活 1.00', async () => {
  const r = await loop.run({ agentCount: 50, ticks: 200, seed: 1, phase2: true });
  assert.equal(r.phase2.summary.postCount, 853, '帖子数应保持不变');
  assert.equal(r.phase2.summary.replyCount, 4993, '回复数应保持不变');
  assert.equal(r.phase2.summary.reactCount, 2602, '反应数应保持不变');
  const alive = r.agents.filter((a) => r.world.agents[a.id] && r.world.agents[a.id].alive !== false).length;
  assert.equal(alive, 50, '50 居民默认局应全部存活');
  const noCredit = await loop.run({ agentCount: 50, ticks: 200, seed: 1, phase2: true, reputationCreditEnabled: false });
  assert.ok(
    Math.abs(noCredit.phase2.summary.interestAccrued - r.phase2.summary.interestAccrued) > 50,
    '声誉→信贷路径应保留显著差异',
  );
});
