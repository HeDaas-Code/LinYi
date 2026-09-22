/**
 * truman-town.civilization — 文明系统统一出口。
 *
 * 汇总 legacy（graph/summary.extractor/summary.writer）、collapse（detector/confirmer）、
 * restart 与 tech（tree/research/lock），供 api/observer/runtime 等上层模块 import，
 * 实现「文明崩溃 → 遗产归档 → 沙盒重启 → 遗产注入下一代」与「技术研究/失传」的完整闭环。
 */

export * as legacy from './legacy/index.js';
export * as collapse from './collapse/index.js';
export * as tech from './tech/index.js';
import * as restart from './restart.js';

export { restart };
