/**
 * truman-town.agent.decision.context — 决策上下文 / Decision Context
 *
 * 把动机、预想池评分、记忆与生存压力归一化为统一决策输入（items），
 * 再按来源权重与单项分数排序，供决策选择器消费。
 */

function norm(score) {
  return typeof score === 'number' && Number.isFinite(score) ? score : 0;
}

function toItems(list, source, mapFn) {
  const items = Array.isArray(list) ? list : [];
  return items.map((raw, index) => {
    const mapped = mapFn(raw, index);
    const id = mapped.id ?? `${source}:${index}`;
    return {
      id,
      source,
      label: mapped.label ?? id,
      score: norm(mapped.score),
      ...(mapped.payload !== undefined ? { payload: mapped.payload } : {}),
    };
  });
}

/**
 * 组装决策上下文。
 * @param {{
 *   agentId?: string,
 *   ts?: number,
 *   motivations?: Array<{ id?: string, label?: string, score?: number }>,
 *   anticipations?: Array<{ id?: string, action?: unknown, score?: number }>,
 *   memories?: Array<{ id?: string, memoryId?: string, content?: unknown, salience?: number }>,
 *   pressures?: Array<{ id?: string, need?: string, level?: number }>
 * }} [input]
 * @returns {{ agentId: string | null, ts: number, items: Array<object> }}
 */
export function assemble(input = {}) {
  const agentId = input.agentId ?? null;
  const ts = typeof input.ts === 'number' ? input.ts : Date.now();
  const items = [
    ...toItems(input.motivations, 'motivation', (m) => ({ id: m.id, label: m.label, score: m.score, payload: m })),
    ...toItems(input.anticipations, 'anticipation', (a) => ({ id: a.id, label: a.action ?? a.label, score: a.score, payload: a })),
    ...toItems(input.memories, 'memory', (m) => ({ id: m.id ?? m.memoryId, label: m.label ?? m.content, score: m.salience, payload: m })),
    ...toItems(input.pressures, 'pressure', (p) => ({ id: p.id, label: p.need ?? p.label, score: p.level, payload: p })),
  ];
  return { agentId, ts, items };
}

const DEFAULT_SOURCE_WEIGHTS = {
  motivation: 1,
  anticipation: 1,
  memory: 0.5,
  pressure: 1.5,
};

/**
 * 对上下文 items 按「来源权重 × 单项分数」排序。
 * @param {{ items: Array<object> }} context
 * @param {{ sourceWeights?: Record<string, number> }} [options]
 * @returns {Array<object>}
 */
export function rank(context, options = {}) {
  if (context === null || typeof context !== 'object' || !Array.isArray(context.items)) {
    throw new TypeError('decision.context.rank: context 必须为 assemble 的返回值');
  }
  const weights = { ...DEFAULT_SOURCE_WEIGHTS, ...(options.sourceWeights ?? {}) };
  const ranked = context.items.map((item) => {
    const w = typeof weights[item.source] === 'number' ? weights[item.source] : 1;
    return { ...item, weightedScore: item.score * w };
  });
  ranked.sort((a, b) => {
    if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
    const aid = String(a.id);
    const bid = String(b.id);
    return aid < bid ? -1 : aid > bid ? 1 : 0;
  });
  return ranked;
}
