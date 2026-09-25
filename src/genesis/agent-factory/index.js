/**
 * truman-town.genesis.agent-factory — 居民工厂。
 *
 * template 决定"一类居民怎么构成"（纯函数），assemble 把它们变成真实居民
 * （唯一产生副作用的环节，且装配失败会回滚）。
 */

export * as template from './template.js';
export * as assemble from './assemble.js';
