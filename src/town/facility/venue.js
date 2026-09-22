/**
 * truman-town.town.facility.venue — 场馆预约 / Venue Booking
 *
 * 预订与取消活动场馆。每个预约记录 venueId、预订者、tick 区间与用途；场馆
 * 清单由 facility.public 登记（本模块只负责预约簿）。以 graph store 持久化。
 */

import * as graph from '../../infra/store/graph.js';
import * as identity from '../../infra/identity.js';

const TYPE = 'town.facility.venue';
const PREFIX = 'town:venue:booking:';

function nodeId(id) {
  return PREFIX + id;
}

function assertId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('venue: id 必须为非空字符串');
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * 预订场馆。
 * @param {{ venueId: string, by: string, tick?: number, duration?: number, purpose?: string, bookingId?: string }} input
 * @returns {object} 预约快照
 */
export function book(input = {}) {
  assertId(input.venueId);
  assertId(input.by);
  const bookingId = typeof input.bookingId === 'string' && input.bookingId !== '' ? input.bookingId : identity.next('booking');
  const booking = {
    bookingId,
    venueId: input.venueId,
    by: input.by,
    tick: typeof input.tick === 'number' && Number.isInteger(input.tick) && input.tick >= 0 ? input.tick : 0,
    duration: typeof input.duration === 'number' && Number.isInteger(input.duration) && input.duration >= 0 ? input.duration : 1,
    purpose: typeof input.purpose === 'string' ? input.purpose : '',
    cancelled: false,
  };
  graph.write({ id: nodeId(bookingId), type: TYPE, data: booking });
  return clone(booking);
}

/**
 * 取消预约（软取消：标记 cancelled）。
 * @param {{ bookingId: string }} input
 * @returns {object} 被取消的预约快照
 */
export function cancel(input = {}) {
  assertId(input.bookingId);
  const node = graph.read(nodeId(input.bookingId));
  if (node === null || node.data === undefined) {
    throw new Error('venue: 预约 "' + input.bookingId + '" 不存在');
  }
  const booking = clone(node.data);
  booking.cancelled = true;
  graph.write({ id: nodeId(input.bookingId), type: TYPE, data: booking });
  return booking;
}

/**
 * 查询预约。
 * - query()              → 全部预约（含已取消）
 * - query({venueId})     → 按场馆过滤
 * - query({active:true}) → 仅有效预约
 * @param {{ venueId?: string, active?: boolean } | undefined} [query]
 * @returns {object[]}
 */
export function query(query) {
  const all = graph.read({ type: TYPE }).map((n) => clone(n.data));
  if (query === undefined || query === null) return all;
  if (typeof query.venueId === 'string') return all.filter((b) => b.venueId === query.venueId);
  if (query.active === true) return all.filter((b) => b.cancelled !== true);
  return all;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
