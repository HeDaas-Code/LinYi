/**
 * truman-town.api.observer — 观测接口 / Observer API
 *
 * 对外查询世界状态与智能体详情：
 *   GET /api/v1/world/state      → 当前世界状态快照（tick / 资源 / 需求 / 编年计数）
 *   GET /api/v1/agents/:agent_id → 智能体详情 + 最近决策 / 行为日志
 */

import * as registry from '../runtime/registry.js';
import * as loop from '../runtime/orchestrator/loop.js';
import { recorder } from '../observer/index.js';
import { HttpError } from './http.js';

/** 当前世界状态快照（委托 loop.snapshot）。 */
export function worldState() {
  return loop.snapshot();
}

/**
 * 智能体详情：注册表实体 + 世界状态（存活/出生 tick/最近行为/需求）
 * + 最近决策与行为日志（各取最近 10 条）。
 * @param {string} agentId
 * @returns {object}
 */
export function agentDetail(agentId) {
  const record = registry.lookup(agentId);
  if (record === null || record.type !== 'agent') {
    throw new HttpError(404, 'agent not found: ' + agentId);
  }
  const snap = loop.snapshot();
  const worldAgent = snap.world.agents?.[agentId] ?? {};
  const needs = snap.world.needs?.[agentId] ?? {};
  const decisions = recorder.decisionLog.list()
    .filter((d) => d.data?.agentId === agentId)
    .slice(-10)
    .map((d) => d.data);
  const actions = recorder.actionLog.list()
    .filter((a) => a.data?.agentId === agentId)
    .slice(-10)
    .map((a) => a.data);
  return {
    id: agentId,
    name: record.data?.name,
    persona: record.data?.persona,
    alive: worldAgent.alive,
    bornTick: worldAgent.bornTick,
    lastAction: worldAgent.last_action ?? null,
    needs,
    recentDecisions: decisions,
    recentActions: actions,
  };
}

/** 本模块 HTTP 路由表。 */
export const routes = [
  { method: 'GET', path: '/api/v1/world/state', handler: () => worldState() },
  { method: 'GET', path: '/api/v1/agents/:agent_id', handler: ({ params }) => agentDetail(params.agent_id) },
];
