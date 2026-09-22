/**
 * truman-town.survival.events.impact — 事件影响 / Event Impact
 *
 * 把突发事件施加到避难所、资源与居民，并解决事件链。apply 解析事件
 * effects（foodDelta/waterDelta/shelterDamage）落到 food/water 库存与避难所
 * 完整度，并写入 observer.recorder 事件日志；resolve 按队列顺序解决事件及其
 * chain，返回完整影响结果，供 runtime 主循环在 survival 阶段调用。
 */

import * as graph from '../../infra/store/graph.js';
import * as food from '../resources/food.js';
import * as water from '../resources/water.js';
import * as recorder from '../../observer/recorder/index.js';

const SHELTER_ID = 'shelter:main';
const SHELTER_TYPE = 'survival.shelter';
const SHELTER_DEFAULT = Object.freeze({ integrity: 100, capacity: 50, damage: 0 });

function loadShelter() {
  const node = graph.read(SHELTER_ID);
  if (node && node.data && typeof node.data.integrity === 'number') {
    return { ...SHELTER_DEFAULT, ...node.data };
  }
  return { ...SHELTER_DEFAULT };
}

function saveShelter(state) {
  return graph.write({ id: SHELTER_ID, type: SHELTER_TYPE, data: state }).data;
}

function normalizeEvent(event, i) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('impact: event 必须为对象');
  }
  return {
    id: (typeof event.id === 'string' && event.id !== '') ? event.id : `event_${i + 1}`,
    type: (typeof event.type === 'string' && event.type !== '') ? event.type : 'generic',
    effects: (event.effects && typeof event.effects === 'object') ? event.effects : {},
    ...(Array.isArray(event.chain) ? { chain: event.chain } : {}),
  };
}

function applyEffects(event) {
  const changes = {};
  const fx = event.effects;

  if (typeof fx.foodDelta === 'number' && fx.foodDelta !== 0) {
    changes.food = fx.foodDelta > 0 ? food.produce(fx.foodDelta) : food.consume(-fx.foodDelta);
  }
  if (typeof fx.waterDelta === 'number' && fx.waterDelta !== 0) {
    changes.water = fx.waterDelta > 0 ? water.produce(fx.waterDelta) : water.consume(-fx.waterDelta);
  }
  if (typeof fx.shelterDamage === 'number' && fx.shelterDamage !== 0) {
    const shelter = loadShelter();
    const damage = Math.max(0, fx.shelterDamage);
    shelter.damage += damage;
    shelter.integrity = Math.max(0, shelter.integrity - damage);
    changes.shelter = saveShelter(shelter);
  }
  return changes;
}

function summarize(changes) {
  const out = {};
  if (changes.food) {
    out.food = { stockpile: changes.food.stockpile, consumed: changes.food.consumed ?? null, produced: changes.food.produced ?? null };
  }
  if (changes.water) {
    out.water = { stockpile: changes.water.stockpile, consumed: changes.water.consumed ?? null, produced: changes.water.produced ?? null };
  }
  if (changes.shelter) {
    out.shelter = { integrity: changes.shelter.integrity, damage: changes.shelter.damage };
  }
  return out;
}

/**
 * 施加单个突发事件：应用 effects 到资源与避难所，并记录事件日志。
 * @param {object} event 事件（id/type/effects{foodDelta,waterDelta,shelterDamage}/chain）
 * @param {{ tick?: number }} [ctx] ctx.tick 用于事件日志的时间戳
 * @returns {{ applied: boolean, event: object, changes: object, log: object }}
 */
export function apply(event, ctx = {}) {
  const ev = normalizeEvent(event, 0);
  const changes = applyEffects(ev);
  const tick = typeof ctx?.tick === 'number' ? ctx.tick : 0;

  const log = recorder.eventLog.record({
    tick,
    topic: `survival.${ev.type}`,
    payload: { eventId: ev.id, type: ev.type, effects: ev.effects, changes: summarize(changes) },
  });

  return { applied: true, event: ev, changes, log };
}

/**
 * 解决一批突发事件及其事件链（广度优先按声明顺序）。
 * @param {object | object[]} events
 * @param {{ tick?: number }} [ctx]
 * @returns {{ resolved: number, results: Array<object> }}
 */
export function resolve(events, ctx = {}) {
  const list = Array.isArray(events) ? events : [events];
  const results = [];
  const queue = [...list];
  const seen = new Set();

  while (queue.length > 0) {
    const raw = queue.shift();
    if (raw === null || raw === undefined) continue;
    const ev = normalizeEvent(raw, results.length);
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);

    results.push(apply(ev, ctx));
    if (Array.isArray(ev.chain)) {
      for (const next of ev.chain) queue.push(next);
    }
  }

  return { resolved: results.length, results };
}

/** 复位避难所状态到默认（测试用）。 */
export function __reset() {
  saveShelter({ ...SHELTER_DEFAULT });
}
