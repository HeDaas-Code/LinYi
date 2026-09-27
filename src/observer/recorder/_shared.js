/**
 * 内部共享序号器（不作为 Normify 模块暴露）。
 *
 * 为 decision / action / event 三类日志提供全局单调递增的写入序号 seq，
 * 保证同一 tick 内多条日志仍能按写入顺序稳定排序（编年编译与审计回溯使用）。
 */

let seq = 0;

/** 返回下一个日志写入序号。 */
export function nextSeq() {
  seq += 1;
  return seq;
}

/** 复位序号器（测试用）。 */
export function __resetSeq() {
  seq = 0;
}

// ---- 持久化：日志写入序号必须进存档 ----

/**
 * 导出日志序号。
 *
 * 序号参与日志节点 id（obs.event.<序号> / obs.decision.<序号> ...）。
 * 不入档则恢复后从 1 重新发号，新日志会**覆盖**存档中已有的同 id 节点，
 * 审计与编年志历史被静默截断。
 */
export function __snapshot() {
  return { seq };
}

/**
 * 恢复日志序号。
 * @param {{seq?: number}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('recorder.__restore: 状态必须为对象');
  }
  seq = Number.isInteger(data.seq) && data.seq >= 0 ? data.seq : 0;
  return { seq };
}
