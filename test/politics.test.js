import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';
import * as pubsub from '../src/infra/events/pubsub.js';
import * as recorder from '../src/observer/recorder/index.js';
import * as social from '../src/social/index.js';

const { faction, law, leader, conflict } = social.politics;

function resetAll() {
  graph.__reset();
  identity.__reset();
  pubsub.__reset();
  recorder.__reset();
}

function countType(type) {
  return graph.read({ type }).length;
}

test('faction: 建派/加入/退出/解散', () => {
  resetAll();
  const f = faction.form({ name: '采掘派', founderId: 'agent_a', tick: 1 });
  assert.match(f.factionId, /^fac_\d{12}$/);
  assert.deepEqual(f.members, ['agent_a']);

  const joined = faction.join({ factionId: f.factionId, agentId: 'agent_b', tick: 2 });
  assert.deepEqual(joined.members, ['agent_a', 'agent_b']);

  const left = faction.leave({ factionId: f.factionId, agentId: 'agent_a', tick: 3 });
  assert.deepEqual(left.members, ['agent_b']);

  const dissolved = faction.leave({ factionId: f.factionId, agentId: 'agent_b', tick: 4 });
  assert.equal(dissolved.status, 'dissolved');
  assert.equal(countType('politics.faction'), 1);
  assert.throws(() => faction.join({ factionId: f.factionId, agentId: 'x' }), /inactive/);
});

test('faction: 结盟与对立 + 关系查询', () => {
  resetAll();
  const a = faction.form({ name: 'A', founderId: 'a1' });
  const b = faction.form({ name: 'B', founderId: 'b1' });
  const c = faction.form({ name: 'C', founderId: 'c1' });

  const ally = faction.ally({ a: a.factionId, b: b.factionId, tick: 1 });
  assert.equal(ally.stance, 'ally');
  faction.oppose({ a: a.factionId, b: c.factionId, tick: 1 });

  const relA = faction.relationship({ factionId: a.factionId });
  assert.equal(relA.length, 2);
  assert.ok(relA.every((r) => r.a === a.factionId || r.b === a.factionId));
  assert.equal(faction.list().length, 3);
});

test('law: 提议→表决通过→执行', () => {
  resetAll();
  const events = [];
  pubsub.subscribe('politics.law.*', () => {});
  pubsub.subscribe('*', (p, m) => events.push(m.topic));

  const l = law.propose({ title: '宵禁', text: '23:00 后禁止外出', proposerId: 'agent_a', tick: 1 });
  assert.equal(l.status, 'proposed');
  assert.match(l.lawId, /^law_\d{12}$/);

  law.vote({ lawId: l.lawId, agentId: 'agent_a', vote: 'no', tick: 2 });
  law.vote({ lawId: l.lawId, agentId: 'agent_b', vote: 'yes', tick: 3 });
  const voted = law.vote({ lawId: l.lawId, agentId: 'agent_c', vote: 'yes', tick: 4 });
  assert.equal(voted.status, 'enacted');
  assert.equal(voted.yes, 2);
  assert.equal(voted.no, 1);

  const receipt = law.enforce({ lawId: l.lawId, agentId: 'agent_b', violation: '深夜外出', tick: 5 });
  assert.equal(receipt.penalty.type, 'fine');

  assert.ok(events.includes('politics.law.proposed'));
  assert.ok(events.includes('politics.law.enacted'));
  assert.ok(events.includes('politics.law.enforced'));
  // 三次表决写三条决策日志
  assert.equal(countType('observer.decision'), 3);
  // 执行写一条行为日志
  assert.equal(countType('observer.action'), 1);
});

test('law: 未生效规则不可执行，票数持平不通过', () => {
  resetAll();
  const l = law.propose({ title: '税法', proposerId: 'agent_a' });
  assert.throws(() => law.enforce({ lawId: l.lawId, agentId: 'x' }), /not_enacted/);
  law.vote({ lawId: l.lawId, agentId: 'agent_a', vote: 'no' });
  const tied = law.vote({ lawId: l.lawId, agentId: 'agent_b', vote: 'yes' });
  assert.equal(tied.status, 'proposed');
  assert.equal(tied.yes, 1);
  assert.equal(tied.no, 1);
});

test('leader: 选举→改票选举（领导权更替）→罢免', () => {
  resetAll();
  const e1 = leader.elect({ agentId: 'agent_a', support: 0.4, tick: 1 });
  assert.equal(e1.elected, true);
  assert.equal(e1.leader.agentId, 'agent_a');
  assert.equal(leader.current(null).agentId, 'agent_a');

  // 支持度不足无法更替
  const e2 = leader.elect({ agentId: 'agent_b', support: 0.3, tick: 2 });
  assert.equal(e2.elected, false);
  assert.equal(e2.reason, 'support_insufficient');
  assert.equal(leader.current(null).agentId, 'agent_a');

  // 支持度更高完成更替
  const e3 = leader.elect({ agentId: 'agent_b', support: 0.6, tick: 3 });
  assert.equal(e3.elected, true);
  assert.equal(e3.replaced, true);
  assert.equal(e3.leader.terms, 2);
  assert.equal(leader.current(null).agentId, 'agent_b');

  const o = leader.oust({ agentId: 'agent_c', tick: 4 });
  assert.equal(o.ousted, true);
  assert.equal(o.leader.status, 'ousted');
});

test('leader: 政令发布与授权校验', () => {
  resetAll();
  leader.elect({ agentId: 'agent_a', support: 0.5, tick: 1 });
  const d = leader.decree({ leaderId: 'agent_a', title: '配给制', text: '每人每日定量', tick: 2 });
  assert.equal(d.title, '配给制');
  assert.ok(d.decreeId.startsWith('decree_'));
  assert.throws(() => leader.decree({ leaderId: 'agent_b', title: 'x' }), /not_authorized/);
});

test('conflict: 开启→升级→调停→解决（伤亡折算）', () => {
  resetAll();
  const c = conflict.start({ partyA: 'fac_a', partyB: 'fac_b', cause: '水源', pressure: 0.5, tick: 1 });
  assert.equal(c.status, 'open');
  assert.ok(c.intensity >= 0.25);
  assert.match(c.conflictId, /^cnf_\d{12}$/);

  const escalated = conflict.escalate({ conflictId: c.conflictId, delta: 0.3, tick: 2 });
  assert.ok(escalated.intensity > c.intensity);

  const mediated = conflict.mediate({ conflictId: c.conflictId, mediatorId: 'elder', tick: 3 });
  assert.ok(mediated.intensity < escalated.intensity);
  assert.equal(mediated.mediatorId, 'elder');

  const resolved = conflict.resolve({ conflictId: c.conflictId, outcome: 'settle', tick: 4 });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.casualties, Math.round(resolved.intensity * 10));
  assert.equal(conflict.list().length, 1);
  assert.throws(() => conflict.resolve({ conflictId: c.conflictId }), /closed/);
});

test('conflict: 非法开启与升级校验', () => {
  resetAll();
  assert.throws(() => conflict.start({ partyA: 'a', partyB: 'a' }), /不能相同/);
  const c = conflict.start({ partyA: 'a', partyB: 'b' });
  conflict.resolve({ conflictId: c.conflictId });
  assert.throws(() => conflict.escalate({ conflictId: c.conflictId }), /closed/);
});
