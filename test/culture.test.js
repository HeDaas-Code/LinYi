import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as rng from '../src/infra/rng.js';
import * as identity from '../src/infra/identity.js';
import * as social from '../src/social/index.js';

const { culture } = social;
const { norms, ritual, meme } = culture;

function resetAll() {
  graph.__reset();
  rng.__reset();
  identity.__reset();
}

test('norms: update 定义/更新规范，query 单条与全量', () => {
  resetAll();
  const n = norms.update({ id: 'no_steal', valence: 'forbidden', strength: 0.8 });
  assert.equal(n.valence, 'forbidden');
  assert.equal(n.strength, 0.8);
  assert.equal(n.violations, 0);

  norms.update({ id: 'share_food', valence: 'accepted', strength: 0.6 });
  assert.equal(norms.query('no_steal').valence, 'forbidden');
  assert.equal(norms.query().length, 2);
  assert.equal(norms.query('missing'), null);
});

test('norms: 非法 valence / strength / id 抛错', () => {
  resetAll();
  assert.throws(() => norms.update({ id: 'x', valence: 'bad' }), TypeError);
  assert.throws(() => norms.update({ id: 'x', strength: 1.5 }), TypeError);
  assert.throws(() => norms.update({ id: '', valence: 'accepted' }), TypeError);
});

test('norms: violate 累积违规、施加社会压力并写事件日志', () => {
  resetAll();
  norms.update({ id: 'no_steal', valence: 'forbidden', strength: 0.8 });

  const r1 = norms.violate({ agentId: 'alice', normId: 'no_steal', tick: 1, context: { item: 'bread' } });
  assert.equal(r1.pressure, 0.8);
  assert.equal(r1.norm.violations, 1);
  assert.equal(r1.violation.agentId, 'alice');
  assert.equal(r1.log.data.topic, 'culture.norm.violated');

  const r2 = norms.violate({ agentId: 'alice', normId: 'no_steal', tick: 2 });
  assert.equal(r2.pressure, 1.6);
  assert.equal(r2.norm.violations, 2);
  assert.equal(norms.pressure('alice'), 1.6);
  assert.equal(norms.pressure('bob'), 0);
});

test('norms: 违反未注册规范抛错', () => {
  resetAll();
  assert.throws(() => norms.violate({ agentId: 'a', normId: 'nope' }), Error);
});

test('ritual: schedule 注册、hold 订馆/累计凝聚力/写事件日志', () => {
  resetAll();
  ritual.schedule({ name: 'harvest', interval: 5, venueId: 'square', purpose: '丰收祭' });
  const s = ritual.query('harvest');
  assert.equal(s.interval, 5);
  assert.equal(s.cohesion, 0);

  const r = ritual.hold({ name: 'harvest', tick: 5, participants: ['a', 'b'] });
  assert.equal(r.held, true);
  assert.ok(r.booking !== null && r.booking.venueId === 'square');
  assert.equal(r.cohesion, 1);
  assert.equal(r.log.data.topic, 'culture.ritual.held');
  assert.equal(ritual.query('harvest').held, 1);
  assert.equal(ritual.cohesion(), 1);
});

test('ritual: 无 venueId 不订馆；未注册 hold 抛错', () => {
  resetAll();
  ritual.schedule({ name: 'memorial', interval: 10 });
  const r = ritual.hold({ name: 'memorial', tick: 10 });
  assert.equal(r.booking, null);
  assert.equal(r.cohesion, 1);
  assert.throws(() => ritual.hold({ name: 'unknown', tick: 0 }), Error);
});

test('ritual: due 按周期判定，hold 推进 lastHeld', () => {
  resetAll();
  ritual.schedule({ name: 'harvest', interval: 3 });
  assert.equal(ritual.due({ tick: 0 }).length, 1);
  ritual.hold({ name: 'harvest', tick: 0 });
  assert.equal(ritual.due({ tick: 2 }).length, 0);
  assert.equal(ritual.due({ tick: 3 }).length, 1);
  assert.equal(ritual.due({ tick: 4 }).length, 1); // 周期已满且未再举行，持续到期
  ritual.hold({ name: 'harvest', tick: 3 });
  assert.equal(ritual.due({ tick: 5 }).length, 0);
});

test('meme: spread 播种并累积携带者，reach 统计', () => {
  resetAll();
  const m = meme.spread({ memeId: 'survivor', fromAgent: 'a', toAgent: 'b', tick: 1 });
  assert.deepEqual(m.carriers, ['a', 'b']);
  assert.equal(meme.reach('survivor'), 2);
  meme.spread({ memeId: 'survivor', fromAgent: 'b', toAgent: 'c', tick: 2 });
  assert.equal(meme.reach('survivor'), 3);
  assert.equal(meme.query('survivor').carriers.length, 3);
});

test('meme: mutate 用 rng 变异出新一代并写事件日志', () => {
  resetAll();
  rng.seed(42);
  meme.spread({ memeId: 'm1', fromAgent: 'a', toAgent: 'b' });
  const m = meme.mutate({ memeId: 'm1', tick: 3 });
  assert.equal(m.generation, 1);
  assert.equal(m.variants, 1);
  assert.ok(m.fitness >= 0 && m.fitness < 1);
});

test('meme: extinct 标记消亡，消亡后不可再 spread/mutate', () => {
  resetAll();
  meme.spread({ memeId: 'm2', fromAgent: 'a', toAgent: 'b' });
  const e = meme.extinct({ memeId: 'm2', tick: 4 });
  assert.equal(e.extinct, true);
  assert.throws(() => meme.spread({ memeId: 'm2', fromAgent: 'b', toAgent: 'c' }), Error);
  assert.throws(() => meme.mutate({ memeId: 'm2' }), Error);
});

test('meme: 变异/消亡不存在的模因抛错', () => {
  resetAll();
  assert.throws(() => meme.mutate({ memeId: 'ghost' }), Error);
  assert.throws(() => meme.extinct({ memeId: 'ghost' }), Error);
});
