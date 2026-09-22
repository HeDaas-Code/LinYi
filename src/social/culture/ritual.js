/**
 * truman-town.social.culture.ritual — 仪式 / Ritual
 *
 * 葬礼、丰收、命名与重启纪念等仪式的发起与举行。schedule 注册周期仪式（interval
 * 个 tick 触发一次），hold 在指定 tick 举行：预订场馆（town.facility.venue）、
 * 累计群体效果（cohesion 凝聚力）、推进周期并写入 observer 事件日志；due 判定
 * 当前 tick 应触发的仪式，供主循环按周期驱动。
 */

import * as graph from '../../infra/store/graph.js';
import * as venue from '../../town/facility/venue.js';
import * as recorder from '../../observer/recorder/index.js';

const RITUAL_TYPE = 'social.culture.ritual';
const PREFIX = 'ritual:';

function assertName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('ritual: name 必须为非空字符串');
  }
}

/**
 * 注册 / 更新一个周期仪式。
 * @param {{ name: string, interval?: number, venueId?: string, purpose?: string }} input
 * @returns {object} 仪式日程快照
 */
export function schedule({ name, interval = 1, venueId = '', purpose = '' } = {}) {
  assertName(name);
  if (!Number.isInteger(interval) || interval < 1) {
    throw new TypeError('ritual.schedule: interval 必须为 >= 1 的整数');
  }
  const existing = graph.read(PREFIX + name);
  const prev = existing && existing.data ? existing.data : {};
  const ritual = {
    name,
    interval,
    venueId: typeof venueId === 'string' ? venueId : '',
    purpose: typeof purpose === 'string' ? purpose : '',
    lastHeld: prev.lastHeld ?? null,
    held: prev.held ?? 0,
    cohesion: prev.cohesion ?? 0,
  };
  graph.write({ id: PREFIX + name, type: RITUAL_TYPE, data: ritual });
  return structuredClone(ritual);
}

/**
 * 在当前 tick 举行仪式：预订场馆、累计群体效果、推进周期并写事件日志。
 * @param {{ name: string, tick?: number, participants?: string[] }} input
 * @returns {{ held: boolean, ritual: object, booking: object|null, cohesion: number, log: object }}
 */
export function hold({ name, tick = 0, participants = [] } = {}) {
  assertName(name);
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('ritual.hold: tick 必须为非负整数');
  }
  const node = graph.read(PREFIX + name);
  if (node === null || node.data === undefined) {
    throw new Error('ritual.hold: 仪式 "' + name + '" 未注册（先 schedule）');
  }
  const ritual = structuredClone(node.data);
  const list = Array.isArray(participants) ? participants : [];

  let booking = null;
  if (ritual.venueId !== '') {
    booking = venue.book({
      venueId: ritual.venueId,
      by: 'culture',
      tick,
      duration: 1,
      purpose: ritual.purpose || ritual.name,
    });
  }

  ritual.cohesion += 1;
  ritual.held += 1;
  ritual.lastHeld = tick;
  graph.write({ id: PREFIX + name, type: RITUAL_TYPE, data: ritual });

  const log = recorder.eventLog.record({
    tick,
    topic: 'culture.ritual.held',
    payload: {
      name,
      tick,
      participants: list,
      venueId: ritual.venueId || null,
      bookingId: booking ? booking.bookingId : null,
      cohesion: ritual.cohesion,
    },
  });

  return { held: true, ritual, booking, cohesion: ritual.cohesion, log };
}

/**
 * 判定当前 tick 应触发的周期仪式（lastHeld 为空或距上次已满 interval）。
 * @param {{ tick: number }} input
 * @returns {Array<{ name: string, interval: number, lastHeld: number|null }>}
 */
export function due({ tick = 0 } = {}) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('ritual.due: tick 必须为非负整数');
  }
  const out = [];
  for (const node of graph.read({ type: RITUAL_TYPE })) {
    const r = node.data;
    if (r.lastHeld === null || tick - r.lastHeld >= r.interval) {
      out.push({ name: r.name, interval: r.interval, lastHeld: r.lastHeld });
    }
  }
  return out;
}

/**
 * 查询仪式日程。
 * - query()     → 全部仪式数组
 * - query(name) → 单个仪式或 null
 * @param {string} [name]
 * @returns {object | object[] | null}
 */
export function query(name) {
  if (name === undefined) {
    return graph.read({ type: RITUAL_TYPE }).map((n) => structuredClone(n.data));
  }
  assertName(name);
  const node = graph.read(PREFIX + name);
  return node && node.data ? structuredClone(node.data) : null;
}

/** 汇总所有仪式的群体凝聚力（群体效果）。 */
export function cohesion() {
  let total = 0;
  for (const node of graph.read({ type: RITUAL_TYPE })) {
    total += node.data.cohesion ?? 0;
  }
  return total;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
