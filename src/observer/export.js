/**
 * truman-town.observer.export — 观察者导出。
 *
 * 把时间线与审计结论导出为**人可读的报告**（结构化对象 + Markdown）。
 *
 * 设计取舍：
 * - **导出即事实，不加解释**：报告里的每个数字都能指回具体记录。
 *   任何推断都必须标注它是推断（如"分叉率"是统计，不是结论）。
 * - **Markdown 自包含**：不依赖外部资源，可直接贴进任何文档系统。
 * - **空数据不报错**：沙盘还没跑过时导出应给出"无数据"，而不是抛异常——
 *   导出是观察动作，不该因缺少观察对象而失败。
 */

import * as timeline from './timeline.js';
import * as audit from './audit.js';

function fmt(n, digits = 3) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : String(n);
}

/**
 * 生成结构化报告。
 * @param {{ fromTick?: number, toTick?: number, stride?: number,
 *           comparisons?: Array<{labelA?: string, labelB?: string, a: Array<object>, b: Array<object>}> }} [input]
 */
export function report(input = {}) {
  const tl = timeline.range({ fromTick: input.fromTick, toTick: input.toTick, stride: input.stride });
  const stats = timeline.getStats();

  // 行动分布：从时间线里的决策记录统计。
  const actionCounts = {};
  const agentTicks = new Map();
  let decisionCount = 0;
  for (const p of tl.timeline) {
    for (const e of p.entries) {
      if (e.kind !== 'decision') continue;
      decisionCount += 1;
      // 决策内容形状不唯一（字符串/对象），统一归一化后再统计。
      const a = audit.describeDecision(e.payload).action;
      actionCounts[a] = (actionCounts[a] ?? 0) + 1;
      if (e.agentId) agentTicks.set(e.agentId, (agentTicks.get(e.agentId) ?? 0) + 1);
    }
  }
  const ranked = Object.entries(actionCounts).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));

  const comparisons = (Array.isArray(input.comparisons) ? input.comparisons : []).map((c) => ({
    labelA: c.labelA ?? 'A',
    labelB: c.labelB ?? 'B',
    ...audit.compare(c),
  }));

  return {
    generatedAt: Date.now(),
    range: { fromTick: tl.fromTick, toTick: tl.toTick, ticks: tl.totalTicks },
    timeline: { points: tl.points, truncated: tl.truncated, stride: tl.stride },
    coverage: stats,
    decisions: {
      total: decisionCount,
      distinctActions: ranked.length,
      distribution: ranked.map(([action, count]) => ({
        action,
        count,
        share: decisionCount > 0 ? count / decisionCount : 0,
      })),
      activeAgents: agentTicks.size,
    },
    comparisons,
  };
}

/**
 * 渲染为 Markdown。
 * @param {{ fromTick?: number, toTick?: number, stride?: number, limitPerTick?: number,
 *           comparisons?: Array<object> }} [input]
 */
export function markdown(input = {}) {
  const rep = report(input);
  const limit = Number.isInteger(input.limitPerTick) && input.limitPerTick > 0 ? input.limitPerTick : 6;
  const lines = [];
  lines.push('# 楚门小镇 · 观察者报告');
  lines.push('');
  lines.push('时间范围：tick ' + rep.range.fromTick + ' ~ ' + rep.range.toTick
    + '（共 ' + rep.range.ticks + ' tick）；时间线采样步长 ' + rep.timeline.stride
    + (rep.timeline.truncated ? '（已截断）' : '') + '。');
  lines.push('');
  lines.push('## 决策分布');
  lines.push('');
  if (rep.decisions.total === 0) {
    lines.push('无决策记录。');
  } else {
    lines.push('共 ' + rep.decisions.total + ' 次决策，涉及 ' + rep.decisions.distinctActions
      + ' 种行动、' + rep.decisions.activeAgents + ' 名居民。');
    lines.push('');
    lines.push('| 行动 | 次数 | 占比 |');
    lines.push('| --- | ---: | ---: |');
    for (const d of rep.decisions.distribution) {
      lines.push('| ' + d.action + ' | ' + d.count + ' | ' + (d.share * 100).toFixed(1) + '% |');
    }
  }
  lines.push('');
  lines.push('## 时间线摘要');
  lines.push('');
  const tl = timeline.range({ fromTick: input.fromTick, toTick: input.toTick, stride: input.stride });
  if (tl.timeline.length === 0) {
    lines.push('无时间线数据。');
  } else {
    for (const p of tl.timeline) {
      const acts = p.actions.slice(0, limit).join('、') + (p.actions.length > limit ? ' 等' : '');
      lines.push('- **tick ' + p.tick + '**：' + p.entryCount + ' 条记录，' + p.agentCount
        + ' 名居民' + (acts !== '' ? '，行动：' + acts : '') + '。');
    }
  }
  if (rep.comparisons.length > 0) {
    lines.push('');
    lines.push('## 决策对比');
    lines.push('');
    for (const c of rep.comparisons) {
      lines.push('### ' + c.labelA + ' vs ' + c.labelB);
      lines.push('');
      lines.push('对比 ' + c.compared + ' 个决策点，分叉 ' + c.diverged
        + ' 个（分叉率 ' + (c.divergenceRate * 100).toFixed(1) + '%）。');
      if (c.firstDivergence !== null) {
        lines.push('');
        lines.push('首个分叉：tick ' + c.firstDivergence.tick + ' @ ' + c.firstDivergence.agentId
          + ' —— ' + c.firstDivergence.diffs.map((d) => d.field + ' ' + JSON.stringify(d.a) + '→' + JSON.stringify(d.b)).join('；'));
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function __reset() { /* 导出为只读派生，无自有状态 */ }
