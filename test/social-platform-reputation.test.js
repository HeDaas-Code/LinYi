import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';
import * as rng from '../src/infra/rng.js';
import * as social from '../src/social/index.js';
import { rankTriageByReputation } from '../src/runtime/orchestrator/_stage2.js';
import { loop } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';

const { posts, feeds } = social.platform;
const reputation = social.reputation;

function resetAll() {
  graph.__reset();
  identity.__reset();
  rng.__reset();
}

test('platform.posts: publish / reply / react 计数与状态正确', () => {
  resetAll();
  const p = posts.publish({ authorId: 'a1', content: '好饿，谁能分我点食物？', context: 'hungry', tick: 7, salience: 0.9 });
  assert.ok(p.postId.startsWith('post_'), '应生成帖子 ID');
  assert.equal(p.authorId, 'a1');
  assert.equal(p.context, 'hungry');
  assert.equal(p.replyCount, 0);

  const r1 = posts.reply({ postId: p.postId, authorId: 'a2', content: '我分你一点食物。', tick: 7 });
  assert.equal(r1.replyCount, 1);
  assert.equal(r1.replies.length, 1);
  assert.equal(r1.replies[0].authorId, 'a2');

  const r2 = posts.reply({ postId: p.postId, authorId: 'a3', content: '再坚持一下。', tick: 7 });
  assert.equal(r2.replyCount, 2);

  const reacted = posts.react({ postId: p.postId, agentId: 'a4', kind: 'up', tick: 7 });
  assert.equal(reacted.reactions.up, 1);
  assert.equal(reacted.reactions.down, 0);
  const down = posts.react({ postId: p.postId, agentId: 'a5', kind: 'down', tick: 7 });
  assert.equal(down.reactions.up, 1);
  assert.equal(down.reactions.down, 1);

  // 发帖会写入作者情景记忆（依赖 agent.memory.episodic）
  assert.equal(posts.list().length, 1);
  assert.equal(posts.get(p.postId).replyCount, 2);
  assert.equal(posts.reply({ postId: 'missing', authorId: 'x', content: 'y' }), null, '不存在帖子返回 null');
  assert.equal(posts.react({ postId: 'missing', agentId: 'x', kind: 'up' }), null);
  assert.throws(() => posts.react({ postId: p.postId, agentId: 'x', kind: 'meh' }), TypeError, '非法 kind 应抛错');
});

test('reputation: update / query 夹取 [0,100] + 等级分档 + 历史', () => {
  resetAll();
  assert.equal(reputation.query({ agentId: 'b1' }).score, 50, '缺省初始 50 / neutral');

  const up = reputation.update({ agentId: 'b1', delta: 30, reason: 'help', tick: 1 });
  assert.equal(up.score, 80);
  assert.equal(up.level, 'trusted');
  assert.equal(up.history.length, 1);

  reputation.update({ agentId: 'b1', delta: -100, reason: 'default', tick: 2 });
  assert.equal(reputation.query({ agentId: 'b1' }).score, 0, '夹取下界 0');
  assert.equal(reputation.query({ agentId: 'b1' }).level, 'distrusted');

  reputation.update({ agentId: 'b1', delta: 999, reason: 'hero', tick: 3 });
  assert.equal(reputation.query({ agentId: 'b1' }).score, 100, '夹取上界 100');
  assert.equal(reputation.query({ agentId: 'b1' }).history.length, 3);

  assert.equal(reputation.list().length, 1);
  assert.throws(() => reputation.update({ agentId: 'b1', delta: 'x' }), TypeError, '非数值 delta 应抛错');
});

test('feeds.rank: 同社区/同时效下，高声誉作者帖子排前（声誉被读取的证据）', () => {
  resetAll();
  // 两位作者声誉不同：hi 受信、lo 失信
  reputation.update({ agentId: 'hi', delta: 40, reason: 'setup', tick: 0 }); // 90
  reputation.update({ agentId: 'lo', delta: -40, reason: 'setup', tick: 0 }); // 10

  const ph = posts.publish({ authorId: 'hi', content: 'hi 的帖子', context: 'chat', tick: 5, salience: 0.3 });
  const pl = posts.publish({ authorId: 'lo', content: 'lo 的帖子', context: 'chat', tick: 5, salience: 0.3 });

  const ranked = feeds.rank({ agentId: 'viewer', posts: [pl, ph], tick: 5 });
  assert.equal(ranked[0].authorId, 'hi', '高声誉作者应排第一（声誉被信息流读取）');
  assert.ok(ranked[0]._score > ranked[1]._score, 'hi 的评分应更高');

  const gen = feeds.generate({ agentId: 'viewer', limit: 8, tick: 5 });
  assert.equal(gen.length, 2);
  assert.equal(gen[0].authorId, 'hi');
});

test('reputation 反馈到治疗分诊：rankTriageByReputation 让高声誉者优先（有/无反馈对照）', () => {
  // 两位同严重度患者，输入顺序把低声誉者放在前面
  const patients = [
    { agentId: 'low', severity: 0.5 },
    { agentId: 'high', severity: 0.5 },
  ];
  const scoreOf = (id) => (id === 'high' ? 90 : 10);

  // 无反馈：纯严重度排序（stable）——输入顺序 low, high 不变
  const noFeedback = [...patients].sort((a, b) => b.severity - a.severity);
  assert.deepEqual(noFeedback.map((p) => p.agentId), ['low', 'high'], '无反馈时同等严重度保持原序（low 先）');

  // 有反馈：声誉加成使 high 排到 low 之前
  const withFeedback = rankTriageByReputation(patients, scoreOf, 0.3);
  assert.deepEqual(withFeedback.map((p) => p.agentId), ['high', 'low'], '有声誉反馈时高声誉者优先获得治疗名额');

  // 有/无反馈行为差异明确：谁先获得稀缺治疗名额不同
  assert.notDeepEqual(withFeedback.map((p) => p.agentId), noFeedback.map((p) => p.agentId));
});

test('声誉反馈到信贷利率：高声誉借款人更低利率（有/无反馈对照，同种子）', async () => {
  // 同种子，开/关 reputationCreditEnabled：声誉被读取并改变计息（经济路径）
  const on = await loop.run({ agentCount: 50, ticks: 200, seed: 1, phase2: true });
  const off = await loop.run({ agentCount: 50, ticks: 200, seed: 1, phase2: true, reputationCreditEnabled: false });
  const onInterest = on.phase2.summary.interestAccrued;
  const offInterest = off.phase2.summary.interestAccrued;
  assert.ok(onInterest < offInterest, '高声誉借款人应享受更低利率（利息更低），on=' + onInterest + ' off=' + offInterest);
  assert.ok(offInterest > 0, '关闭反馈时按统一利率计息应 > 0');
});

test('集成：50 居民 × 200 tick × 3 种子存活率 1.00 + 跨种子分叉（≥2 字段差异）+ 处境驱动帖子', async () => {
  const seeds = [1, 2, 3];
  const metrics = [];
  const narratives = [];

  for (const seed of seeds) {
    const report = await loop.run({ agentCount: 50, ticks: 200, seed, phase2: true });

    // 存活率（初始居民全部存活）
    const worldAgents = report.world.agents ?? {};
    const initialIds = report.agents.map((a) => a.id);
    let alive = 0;
    for (const id of initialIds) {
      const rec = worldAgents[id];
      if (rec && rec.alive !== false) alive += 1;
    }
    const rate = initialIds.length > 0 ? alive / initialIds.length : 0;
    assert.equal(rate, 1, 'seed ' + seed + ' 默认参数下存活率必须保持 1.00');

    const s = report.phase2.summary;
    const rep = s.reputation ?? {};
    metrics.push({
      seed,
      postCount: s.postCount,
      replyCount: s.replyCount,
      reactCount: s.reactCount,
      feedSignature: JSON.stringify(s.feedSignature ?? []),
      repMean: Math.round((rep.mean ?? 50) * 100) / 100,
      repTrusted: rep.trusted ?? 0,
      repDistrusted: rep.distrusted ?? 0,
    });

    // 处境驱动帖子（饥饿/患病/破产/贫困）——用于可叙事历史
    const situational = posts.list().filter((p) => ['sick', 'hungry', 'bankrupt', 'poor'].includes(p.context));
    narratives.push({ seed, situational: situational.length, sample: situational.slice(0, 5) });
  }

  // 硬指标②：帖子数/回复数/信息流排序/声誉分布 中至少 2 个字段跨种子出现差异
  const keys = ['postCount', 'replyCount', 'feedSignature', 'repMean', 'repTrusted'];
  const distinctCounts = keys.map((k) => new Set(metrics.map((m) => m[k])).size);
  const diverged = distinctCounts.filter((n) => n >= 2).length;
  assert.ok(diverged >= 2, '至少 2 个字段跨种子分叉，实际 ' + JSON.stringify(metrics));

  // 至少产生处境驱动的帖子（供可叙事历史）
  const totalSituational = narratives.reduce((s, n) => s + n.situational, 0);
  assert.ok(totalSituational >= 1, '应产生处境驱动帖子，实际 ' + JSON.stringify(narratives.map((n) => n.situational)));
});

test('缺陷 D：发帖正文由处境数值与人格口吻合成，不是固定模板', async () => {
  // 契约：编年志里的「居民说了什么」必须承载信息。
  // 修复前正文从 3~4 条固定模板里随机取，同一处境下所有人逐字相同 ——
  // 读者无法分辨是谁在说、有多严重，社交内容形同噪声。
  resetAll();
  await loop.run({ ticks: 60, seed: 42, agentCount: 12, phase2: true });

  const all = posts.list();
  assert.ok(all.length >= 4, '应产生帖子，实际 ' + all.length);
  const bodies = all.map((p) => p.content);
  assert.ok(bodies.every((c) => typeof c === 'string' && c.length > 0),
    '每条帖子都应有非空正文');

  // ① 不再是固定模板：不同正文的数量应显著多于模板条数（4 条聊天 + 3 条患病）。
  const distinct = new Set(bodies);
  assert.ok(distinct.size >= 5,
    '正文应因处境数值/人格而异，实测不同正文仅 ' + distinct.size + ' 条：' + JSON.stringify([...distinct].slice(0, 8)));

  // ② 处境数值确实进入了正文（饥饿/破产/贫困三类应带数字）。
  const numeric = all.filter((p) => ['hungry','bankrupt','poor'].includes(p.context));
  for (const p of numeric) {
    assert.ok(/[0-9]/.test(p.content),
      '处境类正文应携带可读数值：context=' + p.context + ' content=' + p.content);
  }

  // ③ 人格口吻确实进入了正文：同一处境下不同人格的正文应不同。
  const voiceSuffixes = ['总想试试没做过的事。','还是人多了热闹。',
    '手上有活干才踏实。','凡事还是稳一点好。','大家互相帮衬着过吧。'];
  const voiced = all.filter((p) => voiceSuffixes.some((v) => p.content.endsWith(v)));
  assert.ok(voiced.length >= 1,
    '应有帖子带人格口吻，实测 0 条；样本=' + JSON.stringify(bodies.slice(0, 5)));

  // ④ 观察者事件流的 payload 必须带上正文（此前 content 整体缺失）。
  const events = observer.recorder.eventLog.list().filter((n) => n.data.topic === 'social.platform.post');
  assert.ok(events.length >= 1, '发帖应写 observer 事件');
  for (const e of events) {
    assert.ok(typeof e.data.payload.content === 'string' && e.data.payload.content.length > 0,
      'social.platform.post 事件应携带 content');
  }
});
