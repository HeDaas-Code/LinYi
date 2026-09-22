/**
 * truman-town.agent.decision.selector — 行动选择器 / Action Selector
 *
 * 从候选行动中按评分选择最终行动并给出置信度。评分默认取候选 score，
 * 也可传入 scoreFn(candidate, context) 结合决策上下文重算。
 */

function scoreOf(candidate, context, scoreFn) {
  if (typeof scoreFn === 'function') {
    const s = scoreFn(candidate, context);
    return typeof s === 'number' && Number.isFinite(s) ? s : 0;
  }
  return typeof candidate.score === 'number' && Number.isFinite(candidate.score) ? candidate.score : 0;
}

function softmax(scores) {
  if (scores.length === 0) return [];
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((acc, e) => acc + e, 0);
  return exps.map((e) => e / sum);
}

/**
 * 选择评分最高的候选行动。
 * @param {{ candidates?: Array<object>, context?: object, scoreFn?: Function }} [input]
 * @returns {{ id: unknown, action: unknown, score: number, confidence: number, reason: string } | null}
 */
export function choose(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (candidates.length === 0) return null;
  const scored = candidates.map((candidate) => ({
    candidate,
    score: scoreOf(candidate, input.context, input.scoreFn),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aid = String(a.candidate.id ?? '');
    const bid = String(b.candidate.id ?? '');
    return aid < bid ? -1 : aid > bid ? 1 : 0;
  });
  const best = scored[0];
  const probs = softmax(scored.map((s) => s.score));
  return {
    id: best.candidate.id,
    action: best.candidate.action,
    score: best.score,
    confidence: probs[0],
    reason: `从 ${candidates.length} 个候选中按评分选择 ${String(best.candidate.id ?? '')}`,
  };
}

/**
 * 计算某候选（或最高分候选）相对候选集的 softmax 置信度。
 * @param {{ chosen?: object, candidates?: Array<object>, scoreFn?: Function }} [input]
 * @returns {number} 0..1
 */
export function confidence(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (candidates.length === 0) return input.chosen === undefined ? 0 : 1;
  const scores = candidates.map((c) => scoreOf(c, null, input.scoreFn));
  if (input.chosen === undefined) {
    return Math.max(...softmax(scores));
  }
  const idx = candidates.findIndex((c) => c === input.chosen || c.id === input.chosen.id);
  if (idx < 0) return 0;
  return softmax(scores)[idx];
}
