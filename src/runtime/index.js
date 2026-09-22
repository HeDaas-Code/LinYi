/**
 * truman-town.runtime — 沙盘运行时统一出口。
 *
 * 汇总 clock / world-state / registry 与 orchestrator(cycle/perception/dispatch/loop)，
 * 供 survival、agent、ai、observer、api 等模块与主循环集成使用。
 */

export * as clock from './clock.js';
export * as worldState from './world-state.js';
export * as registry from './registry.js';
export * as cycle from './orchestrator/cycle.js';
export * as perception from './orchestrator/perception.js';
export * as dispatch from './orchestrator/dispatch.js';
export * as loop from './orchestrator/loop.js';
