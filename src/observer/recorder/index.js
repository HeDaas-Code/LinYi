/**
 * truman-town.observer.recorder — 行为记录器统一出口。
 *
 * 汇总 decision-log / action-log / event-log 三个不可变日志写入器，
 * 供 runtime 在每个决策/行为节点、事件总线节点调用，实现全程可追踪。
 */

export * as decisionLog from './decision-log.js';
export * as actionLog from './action-log.js';
export * as eventLog from './event-log.js';

import { __resetSeq } from './_shared.js';

/** 复位共享日志序号器（测试用；不清理 graph store，由调用方负责）。 */
export function __reset() {
  __resetSeq();
}
