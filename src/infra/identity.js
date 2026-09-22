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
