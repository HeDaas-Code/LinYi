/**
 * truman-town.infra — 基础设施底座统一出口。
 *
 * 汇总 config / rng / identity / store.graph / events.pubsub 五个基础能力，
 * 供 runtime、survival、agent、ai、observer、api 等上层模块直接 import。
 */

export * as config from './config.js';
export * as rng from './rng.js';
export * as identity from './identity.js';
export * as graph from './store/graph.js';
export * as pubsub from './events/pubsub.js';
