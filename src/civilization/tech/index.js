/**
 * truman-town.civilization.tech — 知识与技术统一出口。
 *
 * 汇总 tree / research / lock 三个能力，供 runtime 主循环、observer 与 api
 * 直接 import，构成"技术前置解锁 → 消耗 tick 与能源研究 → 失传锁定"的闭环。
 */

export * as tree from './tree.js';
export * as research from './research.js';
export * as lock from './lock.js';
