/**
 * truman-town.genesis — 创世链统一出口。
 *
 * 覆盖"造人 → 遗传 → 重启"三段：
 * - tag-pool：50 条特质标签的取值池（12 维度 / 55 候选）
 * - agent-factory：模板（怎么生成）与装配（真正写状态）
 * - heredity：后代特质组合与家世陈述
 * - renewal：文明重启评估与替换
 *
 * 设计原则：模板与组合是纯函数，只有 assemble 与 renewal.replace 产生副作用，
 * 使"生成规则"可单测、可消融，也使重启过程可回滚。
 */

export * as tagPool from './tag-pool.js';
export * as agentFactory from './agent-factory/index.js';
export * as heredity from './heredity/index.js';
export * as renewal from './renewal.js';
