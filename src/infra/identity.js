/**
 * truman-town.infra.identity — ID 生成 / Identity
 *
 * 生成全局唯一且有序的实体 ID。单进程沙盘内使用单调递增计数器，
 * 保证同一前缀下 ID 严格递增（可排序），配合可选前缀区分实体类别
 * （agent / item / building / faction ...）。
 */

let counter = 0;

const PREFIX_RE = /^[a-z][a-z0-9_-]{0,31}$/;

/**
 * 生成下一个 ID。
 * @param {string} [prefix='ent'] 类别前缀（小写字母开头，可含数字、下划线、连字符）
 * @returns {string} 形如 `ent_000000000001` 的有序 ID
 */
export function next(prefix = 'ent') {
  if (typeof prefix !== 'string' || !PREFIX_RE.test(prefix)) {
    throw new TypeError(`identity.next: 非法前缀 "${prefix}"（须匹配 ${PREFIX_RE}）`);
  }
  counter += 1;
  return `${prefix}_${String(counter).padStart(12, '0')}`;
}

/** 复位计数器（测试用）。 */
export function __reset() {
  counter = 0;
}

// ---- 持久化：ID 计数器必须进存档 ----

/**
 * 导出 ID 计数器。
 *
 * 不还原计数器会**重发已用过的 ID**：恢复后下一次 next('agent') 可能生成
 * 与存档中某居民相同的 id，registry 的 upsert 会把两人合并成一个。
 * 这是静默数据损坏，故必须持久化。
 */
export function __snapshot() {
  return { counter };
}

/**
 * 恢复 ID 计数器。只允许向前推进（不允许把计数器调小到已发号之前）。
 * @param {{counter?: number}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('identity.__restore: 状态必须为对象');
  }
  const c = data.counter;
  if (c !== undefined && (!Number.isInteger(c) || c < 0)) {
    throw new TypeError('identity.__restore: counter 必须为非负整数');
  }
  counter = Number.isInteger(c) ? c : 0;
  return { counter };
}
