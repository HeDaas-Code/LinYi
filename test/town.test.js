import { test } from 'node:test';
import assert from 'node:assert/strict';

import { map, building, residence, venue } from '../src/town/index.js';

const { topology, zoning } = map;
const { structure, space } = building;

test('topology: 规划地块与道路并查询邻接', () => {
  topology.__reset();
  const plaza = topology.plan({ id: 'plaza', kind: 'plot', type: 'public', x: 0, y: 0 });
  topology.plan({ id: 'main_road', kind: 'road', type: 'artery', x: 0, y: 1, adjacent: ['plaza'] });
  topology.plan({ id: 'lot_a', kind: 'plot', type: 'residential', x: 1, y: 0, adjacent: ['plaza'] });

  assert.equal(plaza.kind, 'plot');
  assert.equal(topology.query().length, 3);
  assert.equal(topology.query({ kind: 'plot' }).length, 2);
  assert.equal(topology.query({ kind: 'road' }).length, 1);
  assert.equal(topology.query('plaza').type, 'public');
  assert.deepEqual(topology.adjacent('lot_a'), ['plaza']);
  assert.equal(topology.query('missing'), null);
});

test('zoning: 划定与重划分区', () => {
  zoning.__reset();
  const zone = zoning.assign({ id: 'res_a', kind: 'residential', plots: ['lot_a', 'lot_b'], capacity: 20 });
  assert.equal(zone.kind, 'residential');
  assert.equal(zone.capacity, 20);
  assert.deepEqual(zone.plots, ['lot_a', 'lot_b']);

  const rezoned = zoning.rezone({ id: 'res_a', kind: 'commercial', capacity: 30 });
  assert.equal(rezoned.kind, 'commercial');
  assert.equal(rezoned.capacity, 30);
  assert.equal(rezoned.plots.length, 2);

  assert.equal(zoning.query('res_a').kind, 'commercial');
  assert.equal(zoning.query({ kind: 'commercial' }).length, 1);
  assert.throws(() => zoning.assign({ id: 'bad', kind: 'outer_space' }), /非法分区类型/);
  assert.throws(() => zoning.rezone({ id: 'nope', kind: 'public' }), /不存在/);
});

test('structure: 建造/拆除与初始避难所生成', () => {
  structure.__reset();
  const built = structure.construct({ id: 'dorm_a', kind: 'residential', zoneId: 'res_a', capacity: 12 });
  assert.equal(built.kind, 'residential');
  assert.equal(built.capacity, 12);
  assert.equal(structure.query('dorm_a').function, 'residential');

  structure.demolish({ id: 'dorm_a' });
  assert.equal(structure.query('dorm_a'), null);
  assert.throws(() => structure.demolish({ id: 'dorm_a' }), /不存在/);

  const shelter = structure.spawnShelter();
  assert.equal(shelter.length, 5);
  const kinds = shelter.map((b) => b.kind);
  assert.ok(kinds.includes('shelter'));
  assert.ok(kinds.includes('residential'));
  assert.equal(structure.query({ kind: 'residential' }).length, 2);
});

test('space: 容量管理（分配/释放/满员拒绝）', () => {
  space.__reset();
  structure.__reset();
  structure.construct({ id: 'dorm_a', kind: 'residential', capacity: 2 });

  space.allocate({ id: 'bed_1', buildingId: 'dorm_a', occupantId: 'agent_1', kind: 'bed' });
  space.allocate({ id: 'bed_2', buildingId: 'dorm_a', occupantId: 'agent_2', kind: 'bed' });
  assert.equal(space.occupancy('dorm_a'), 2);
  assert.throws(() => space.allocate({ id: 'bed_3', buildingId: 'dorm_a', occupantId: 'agent_3', kind: 'bed' }), /容量已满/);

  space.release({ id: 'bed_1' });
  assert.equal(space.occupancy('dorm_a'), 1);
  assert.equal(space.query({ buildingId: 'dorm_a' }).length, 1);
  assert.throws(() => space.release({ id: 'bed_1' }), /不存在/);
});

test('residence: 入住/搬出/租金与住所查询', () => {
  residence.__reset();
  residence.move_in({ agentId: 'agent_1', residenceId: 'dorm_a' });
  residence.move_in({ agentId: 'agent_2', residenceId: 'dorm_a' });
  residence.move_in({ agentId: 'agent_2', residenceId: 'dorm_a' }); // 幂等

  let dorm = residence.query('dorm_a');
  assert.deepEqual(dorm.residents, ['agent_1', 'agent_2']);
  assert.equal(residence.residenceOf('agent_1'), 'dorm_a');
  assert.equal(residence.residenceOf('agent_3'), null);

  residence.rent({ agentId: 'agent_1', residenceId: 'dorm_a', amount: 5 });
  residence.rent({ agentId: 'agent_1', residenceId: 'dorm_a', amount: 3 });
  dorm = residence.query('dorm_a');
  assert.equal(dorm.rent['agent_1'], 8);

  residence.move_out({ agentId: 'agent_1', residenceId: 'dorm_a' });
  assert.equal(residence.residenceOf('agent_1'), null);
  assert.throws(() => residence.rent({ agentId: 'agent_1', residenceId: 'dorm_a', amount: -1 }), /非负数/);
});

test('venue: 预订/取消/查询预约簿', () => {
  venue.__reset();
  const b1 = venue.book({ venueId: 'hall', by: 'agent_1', tick: 3, duration: 5, purpose: '集会' });
  const b2 = venue.book({ venueId: 'hall', by: 'agent_2', tick: 10, duration: 2 });
  assert.equal(b1.venueId, 'hall');
  assert.equal(venue.query().length, 2);
  assert.equal(venue.query({ venueId: 'hall' }).length, 2);
  assert.equal(venue.query({ active: true }).length, 2);

  venue.cancel({ bookingId: b1.bookingId });
  assert.equal(venue.query({ active: true }).length, 1);
  assert.equal(venue.query({ venueId: 'hall' }).length, 2); // 已取消仍在记录中
  assert.throws(() => venue.cancel({ bookingId: 'ghost' }), /不存在/);
});

test('town 纵向切片：分区 → 建筑 → 空间 → 居民分配 → 场馆预约', () => {
  topology.__reset();
  zoning.__reset();
  structure.__reset();
  space.__reset();
  residence.__reset();
  venue.__reset();

  // 1) 结构化空间底座
  topology.plan({ id: 'lot_r', kind: 'plot', type: 'residential' });
  topology.plan({ id: 'lot_p', kind: 'plot', type: 'public' });

  // 2) 分区
  zoning.assign({ id: 'zone_res', kind: 'residential', plots: ['lot_r'], capacity: 20 });
  zoning.assign({ id: 'zone_pub', kind: 'public', plots: ['lot_p'], capacity: 10 });

  // 3) 初始避难所生成（含容量）
  const shelter = structure.spawnShelter();
  assert.equal(shelter.length, 5);

  // 4) 容量管理：给宿舍分配床位
  space.allocate({ id: 'bed_1', buildingId: 'dorm_a', occupantId: 'resident_1', kind: 'bed' });
  assert.equal(space.occupancy('dorm_a'), 1);

  // 5) 居民分配到场所
  residence.move_in({ agentId: 'resident_1', residenceId: 'dorm_a' });
  assert.equal(residence.residenceOf('resident_1'), 'dorm_a');

  // 6) 场馆预约
  const booking = venue.book({ venueId: 'hall', by: 'resident_1', tick: 5, duration: 3, purpose: '全体大会' });
  assert.equal(booking.by, 'resident_1');
  assert.equal(venue.query({ active: true }).length, 1);
});
