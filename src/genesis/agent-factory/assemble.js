/**
 * truman-town.genesis.agent_factory.assemble — 居民装配。
 *
 * 把模板产出的**描述**变成**真实存在的居民**：写入生命周期、注册进运行时、
 * 安装特质集。这是 genesis 链里唯一产生副作用的环节。
 *
 * 设计取舍：
 * - **装配是事务性的**：任一步失败就回滚已写入的部分，不留"半个居民"。
 *   半个居民比没有居民更糟——它会被注册表统计到，却缺少特质或生命周期。
 * - **id 由调用方决定或由 identity 生成**：本模块不假设 id 格式。
 * - **装配 ≠ 出生**：本模块负责"造出一个初代居民"，也负责"接纳一个后代"；
 *   两者用同一个入口，靠 bornTick/parents 区分，避免两套并行逻辑。
 */

import * as agent from '../../agent/index.js';
import * as registry from '../../runtime/registry.js';
import * as identity from '../../infra/identity.js';
import * as template from './template.js';

/** 已装配居民的记录（供审计与回滚）。 */
const assembled = new Map();

export function __reset() {
  assembled.clear();
}

function assertName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('agent_factory.assemble: name 必须为非空字符串');
  }
}

/**
 * 依据描述创建一个居民并登记。
 *
 * @param {{ agentId?: string, name?: string, templateId?: string, tags?: Array<object>,
 *           tick?: number, age?: number, parents?: { paternal?: string, maternal?: string },
 *           generation?: number, persona?: object }} input
 * @returns {{ agentId: string, name: string, tagCount: number, generation: number, rolledBack: boolean }}
 */
export function create(input = {}) {
  assertName(input.name);
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const age = typeof input.age === 'number' && Number.isFinite(input.age) ? input.age : 0;

  // 描述来源：显式给 tags（后代），否则用模板现抽样（初代）。
  const desc = Array.isArray(input.tags) && input.tags.length > 0
    ? { tags: input.tags, templateId: input.templateId ?? null, persona: input.persona ?? null }
    : template.instantiate({ templateId: input.templateId ?? 'survivor', name: input.name, agentId: input.agentId });

  const agentId = (typeof input.agentId === 'string' && input.agentId !== '')
    ? input.agentId
    : identity.next('agent');

  const written = [];
  try {
    const lifecycle = agent.lifecycle.birth(agentId, { tick, age });
    written.push('lifecycle');

    const tagset = agent.traits.tagset.store.upsert(agentId, desc.tags);
    written.push('tagset');

    const record = registry.register({
      id: agentId,
      type: 'agent',
      data: {
        name: input.name,
        templateId: desc.templateId,
        generation: Number.isInteger(input.generation) ? input.generation : 0,
        parents: input.parents ?? null,
        bornTick: tick,
        age,
        stage: lifecycle.stage,
        alive: true,
        tagCount: desc.tags.length,
        persona: desc.persona,
      },
    });
    written.push('registry');

    const entry = {
      agentId,
      name: input.name,
      templateId: desc.templateId,
      generation: record.data.generation,
      parents: input.parents ?? null,
      bornTick: tick,
      age,
      tagCount: desc.tags.length,
      tags: desc.tags.map((t) => t.key),
      assembledAt: tick,
    };
    assembled.set(agentId, entry);
    return { ...entry, rolledBack: false };
  } catch (err) {
    // 回滚：注册表与生命周期都可撤销（特质集留在 tagset store 里无害，
    // 因为没有任何居民指向该 id，但注册表条目必须撤掉，否则会被统计到）。
    if (written.includes('registry')) {
      try { registry.unregister(agentId); } catch { /* 尽力回滚 */ }
    }
    assembled.delete(agentId);
    throw new Error('agent_factory.assemble.create: 装配失败已回滚（已写 ' + written.join(',') + '）：' + (err && err.message ? err.message : String(err)));
  }
}

/**
 * 只登记（不新建）：用于接纳已存在的外部记录（如从存档恢复）。
 * @param {{ agentId: string, name: string, tick?: number, age?: number, generation?: number }} input
 */
export function register(input = {}) {
  if (typeof input.agentId !== 'string' || input.agentId === '') {
    throw new TypeError('agent_factory.assemble.register: 需要非空 agentId');
  }
  assertName(input.name);
  const existing = registry.lookup(input.agentId);
  if (existing === null || existing === undefined) {
    throw new Error('agent_factory.assemble.register: 未找到实体 "' + input.agentId + '"，请先用 create');
  }
  const record = registry.register({
    ...existing,
    data: { ...(existing.data ?? {}), name: input.name, registeredAt: Number.isInteger(input.tick) ? input.tick : 0 },
  });
  return { agentId: record.id, name: record.data.name, registered: true };
}

/** 列出已装配居民（按装配顺序）。 */
export function list() {
  return [...assembled.values()].map((e) => ({ ...e, tags: [...e.tags] }));
}

export function get(input = {}) {
  const e = assembled.get(input.agentId);
  return e === undefined ? null : { ...e, tags: [...e.tags] };
}

export function getStats() {
  const all = [...assembled.values()];
  const byGeneration = {};
  for (const e of all) byGeneration[e.generation] = (byGeneration[e.generation] ?? 0) + 1;
  return {
    assembled: all.length,
    byGeneration,
    byTemplate: all.reduce((acc, e) => { const k = e.templateId ?? '(未知)'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}),
  };
}
