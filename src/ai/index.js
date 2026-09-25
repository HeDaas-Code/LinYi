/**
 * truman-town.ai — AI 引擎统一出口。
 *
 * 汇总 llm.gateway / llm.router / prompt.agent / thought 四个能力，
 * 供 runtime 决策链、agent 与 api 等上层模块直接 import。
 */

export * as decide from './decide.js';
export * as laya from './laya.js';
export * as gateway from './llm/gateway.js';
export * as router from './llm/router.js';
export * as agentPrompt from './prompt/agent.js';
export * as thought from './thought.js';
