/**
 * truman-town.ai.thought — 思维生成 / Thought Generation
 *
 * 生成智能体内心思考（generate）与行动反思（reflect）。
 * 依赖 llm.gateway 执行补全，依赖 prompt.agent 组装智能体提示词。
 */

import * as gateway from './llm/gateway.js';
import * as agentPrompt from './prompt/agent.js';

function agentContext(agent) {
  if (agent === undefined || agent === null) return {};
  if (typeof agent !== 'object') {
    throw new TypeError('thought: agent 必须为对象');
  }
  return {
    agentId: agent.agentId,
    name: agent.name,
    persona: agent.persona,
    tags: agent.tags,
    memory: agent.memory,
  };
}

function metaFrom(completion, agentId) {
  return {
    agentId,
    provider: completion.provider,
    model: completion.model,
    latencyMs: completion.latencyMs,
    usage: completion.usage,
  };
}

/**
 * 生成智能体在当前处境下的内心思考。
 * @param {object} agent 智能体上下文（agentId/name/persona/tags/memory）
 * @param {string} situation 当前处境描述
 * @returns {Promise<{ thought: string, meta: object }>}
 */
export async function generate(agent, situation) {
  const ctx = agentContext(agent);
  const prompt = agentPrompt.compose({ ...ctx, situation });
  const completion = await gateway.complete({ messages: prompt.messages, task: 'thought' });
  return {
    thought: completion.text,
    meta: metaFrom(completion, ctx.agentId),
  };
}

/**
 * 让智能体对刚执行完的行动做反思。
 * @param {object} agent 智能体上下文（agentId/name/persona/tags/memory）
 * @param {string} action 刚执行的行动描述
 * @param {string} outcome 行动结果描述
 * @returns {Promise<{ reflection: string, meta: object }>}
 */
export async function reflect(agent, action, outcome) {
  const ctx = agentContext(agent);
  const situation = `我刚刚执行了行动：${action}。结果是：${outcome}。请反思这次行动，判断是否达到目的、下次如何改进。`;
  const prompt = agentPrompt.compose({ ...ctx, situation });
  const completion = await gateway.complete({ messages: prompt.messages, task: 'thought' });
  return {
    reflection: completion.text,
    meta: metaFrom(completion, ctx.agentId),
  };
}
