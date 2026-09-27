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
import * as hotLog from '../../infra/store/hot-log.js';

/**
 * 复位共享日志序号器与热数据归档（测试用；不清理 graph store，由调用方负责）。
 *
 * hot-log 的归档与计数器是它自己的模块级状态，不随 graph.__reset 走。
 * 不在这里清的话会跨 run 累加：新一局的 stats 会叠加上一局的 evicted/compacted，
 * 且 lookups 会把本局从未存在的 id 判成「已淘汰」。
 */
export function __reset() {
  __resetSeq();
  hotLog.__reset();
}
