/**
 * truman-town.agent.decision.explainer — 决策解释器 / Decision Explainer
 *
 * 为每次决策生成人类可读的解释（为什么选 A 不选 B），并产出可被观察者审计的
 * 决策轨迹（trace）。explain / trace 不落地日志本身，由主循环写入 observer 决策
 * 日志的 reason 字段，使编年志能讲清"他为什么这么做"。
 */

function fmt(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : String(v ?? '');
}

function rationaleOf(context) {
  const need = context?.dominantNeed ?? null;
  const level = typeof context?.level === 'number' ? context.level : 0;
  const threshold = typeof context?.threshold === 'number' ? context.threshold : 0.4;
  if (need === 'food' && level >= threshold) return '食物需求偏高（' + fmt(level) + '）';
  if (need === 'water' && level >= threshold) return '水源需求偏高（' + fmt(level) + '）';
  return '无紧迫生存需求，按预期收益与风险权衡';
}

/**
 * 生成人类可读决策解释。
 * @param {{ agentId?: string, agentName?: string, tick?: number, chosen?: object, alternatives?: Array<object>, context?: object }} input
 * @returns {string}
 */
export function explain(input = {}) {
  const chosen = input.chosen ?? {};
  const alts = Array.isArray(input.alternatives) ? input.alternatives : [];
  const label = input.agentName || input.agentId || '居民';
  const tick = typeof input.tick === 'number' ? input.tick : '?';
  const chosenAction = chosen.action ?? '未知行动';
  const altActions = alts
    .map((a) => a?.action)
    .filter((a) => a !== undefined && a !== chosenAction);
  const utilPart = typeof chosen.score === 'number' ? '（评分 ' + fmt(chosen.score) + '）' : '';
  const head = '在第 ' + tick + ' tick，' + label + ' 因' + rationaleOf(input.context) + ' 而选择「' + chosenAction + '」' + utilPart;
  const tail = altActions.length > 0 ? '，放弃了「' + altActions.join('」「') + '」' : '';
  return head + tail + '。';
}

/**
 * 生成结构化决策轨迹。
 * @param {object} input 见 explain
 * @returns {{ agentId: string|null, tick: number|null, chosen: unknown, alternatives: Array<unknown>, rationale: string, summary: string }}
 */
export function trace(input = {}) {
  const chosen = input.chosen ?? {};
  const alts = Array.isArray(input.alternatives) ? input.alternatives : [];
  return {
    agentId: input.agentId ?? null,
    tick: typeof input.tick === 'number' ? input.tick : null,
    chosen: chosen.action ?? null,
    alternatives: alts.map((a) => a?.action ?? null).filter((a) => a !== null),
    rationale: rationaleOf(input.context),
    summary: explain(input),
  };
}

/** 复位（无独立状态，保留与其它模块一致的接口）。 */
export function __reset() {}
