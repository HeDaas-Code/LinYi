/**
 * truman-town.runtime.world-state — 世界状态 / World State
 *
 * 保存与恢复世界快照，支持状态比对与内循环回滚。MVP 阶段为进程内内存状态：
 * 一个任意嵌套的普通对象，通过点分路径读写；snapshot/diff/restore 均返回或
 * 接收深拷贝，避免外部意外改写内部快照。
 */

let world = {};

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function toPath(path) {
  if (Array.isArray(path)) return path.map(String);
  if (typeof path === 'string') {
    return path === '' ? [] : path.split('.');
  }
  throw new TypeError('world_state: path 必须为字符串或字符串数组');
}

function getByPath(obj, segments) {
  let cur = obj;
  for (const seg of segments) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

function setByPath(obj, segments, value) {
  if (segments.length === 0) {
    throw new TypeError('world_state.set: path 不能为空');
  }
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const existing = cur[seg];
    if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
      cur[seg] = {};
    }
    cur = cur[seg];
  }
  cur[segments[segments.length - 1]] = value;
}

/**
 * 返回当前世界状态的深拷贝快照。
 * @returns {object}
 */
export function snapshot() {
  return clone(world);
}

/**
 * 读取全部状态或指定路径的值（深拷贝）。
 * - get()          → 全部状态
 * - get('a.b')     → 指定路径的值；缺失返回 undefined
 * @param {string | string[]} [path]
 * @returns {unknown}
 */
export function get(path) {
  if (path === undefined || path === null) return snapshot();
  return clone(getByPath(world, toPath(path)));
}

/**
 * 写入指定路径的值（自动创建中间对象）。
 * @param {string | string[]} path
 * @param {unknown} value
 * @returns {unknown} 已写入值的深拷贝
 */
export function set(path, value) {
  setByPath(world, toPath(path), value);
  return clone(value);
}

/**
 * 用一份快照整体替换当前状态（回滚 / 恢复）。
 * @param {object} snap 必须为普通对象
 * @returns {object} 恢复后的快照
 */
export function restore(snap) {
  if (snap === null || typeof snap !== 'object' || Array.isArray(snap)) {
    throw new TypeError('world_state.restore: 快照必须为普通对象');
  }
  world = structuredClone(snap);
  return snapshot();
}

function leafEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => leafEqual(v, b[i]));
  }
  return false;
}

function diffAt(path, prev, next, out) {
  const prevObj = prev !== null && typeof prev === 'object' && !Array.isArray(prev);
  const nextObj = next !== null && typeof next === 'object' && !Array.isArray(next);
  if (prevObj && nextObj) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of [...keys].sort()) {
      const childPath = path === '' ? key : `${path}.${key}`;
      diffAt(childPath, prev[key], next[key], out);
    }
    return;
  }
  if (leafEqual(prev, next)) return;
  const op = prev === undefined ? 'added' : next === undefined ? 'removed' : 'changed';
  out.push({ path, op, prev: clone(prev), next: clone(next) });
}

/**
 * 计算两份快照之间的结构化差异（叶子粒度）。
 * @param {object} prev
 * @param {object} next
 * @returns {Array<{ path: string, op: 'added' | 'removed' | 'changed', prev: unknown, next: unknown }>}
 */
export function diff(prev, next) {
  const out = [];
  diffAt('', prev, next, out);
  return out;
}

/** 复位世界状态（测试用）。 */
export function __reset() {
  world = {};
}
