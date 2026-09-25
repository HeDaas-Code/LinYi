/**
 * truman-town.observer — 观察者系统统一出口。
 *
 * 汇总行为记录器（recorder）与编年志（chronicle）能力，
 * 供 runtime / survival / api 等模块 import，实现每一次决策与行为可追踪。
 */

export * as recorder from './recorder/index.js';
export * as chronicle from './chronicle/index.js';
export * as experiment from './experiment/index.js';
export * as audit from './audit.js';
export * as timeline from './timeline.js';
export * as exporter from './export.js';
