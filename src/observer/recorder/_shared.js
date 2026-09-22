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
