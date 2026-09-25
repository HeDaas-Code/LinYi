/**
 * truman-town.runtime.orchestrator 内部共享：第三阶段主循环集成 / Phase-3 Loop Integration
 * （不作为 Normify 模块暴露，同 _resource/_store/_jobs/_stage2 一样是内部辅助）
 *
 * 把政治派系（politics）、文化规范与仪式（culture）、心理创伤与崩溃（psyche）、
 * 技术研究与失传（tech）、文明遗产与重启（civilization）接入 loop 的每 tick 流程，
 * 各节点由对应子系统内部写 observer 日志（event-log / action-log / decision-log）。
 *
 * 对外：seed / tick / summary / __reset。
 */

import * as social from '../../social/index.js';
import * as agent from '../../agent/index.js';
import * as civilization from '../../civilization/index.js';
import * as survival from '../../survival/index.js';

// ---- 模块级状态（由 __reset / seed 清空） ----
let seeded = false;
let factionA = null;
let factionB = null;
let allied = false;
let lawId = null;
let lawEnforced = false;
let conflictId = null;
let conflictResolved = false;
let normViolated = false;
let memeMutated = false;
let collapseHandled = false;
let firstCollapse = null;
let scarceTicks = 0;

// ---- 累计计数 ----
let lawsEnacted = 0;
let conflictsResolved = 0;
let ritualsHeld = 0;
let normsViolated = 0;
let memesMutated = 0;
let breakdowns = 0;
let recoveries = 0;
let copings = 0;
let researchesStarted = 0;
let researchesCompleted = 0;
let techsLost = 0;
let collapses = 0;
let restarts = 0;

function avgPressure(agents) {
  if (agents.length === 0) return 0;
  let sum = 0;
  for (const a of agents) {
    sum += survival.needs.pressure.scorer.score({ agentId: a.id }).normalized;
  }
  return sum / agents.length;
}

/**
 * 一次性初始化：派系 + 领导 + 法律、规范 + 仪式 + 模因、创伤播种、启动研究。
 * @param {Array<{ id: string }>} agents 初始居民
 * @param {object} [config]
 * @returns {object}
 */
export function seed(agents, config = {}) {
  seeded = true;
  factionA = null; factionB = null; allied = false;
  lawId = null; lawEnforced = false;
  conflictId = null; conflictResolved = false;
  normViolated = false; memeMutated = false; collapseHandled = false; firstCollapse = null; scarceTicks = 0;
  lawsEnacted = 0; conflictsResolved = 0; ritualsHeld = 0; normsViolated = 0; memesMutated = 0;
  breakdowns = 0; recoveries = 0; copings = 0;
  researchesStarted = 0; researchesCompleted = 0; techsLost = 0; collapses = 0; restarts = 0;

  const ids = agents.map((a) => a.id);
  if (ids.length < 2) {
    return { factions: 0, law: false, norms: 0, ritual: false, meme: false, trauma: false, research: null };
  }

  // 1) politics：派系 + 领导 + 法律
  factionA = social.politics.faction.form({ name: '避难所同盟', founderId: ids[0], tick: 0 }).factionId;
  social.politics.faction.join({ factionId: factionA, agentId: ids[1], tick: 0 });
  if (ids.length >= 3) social.politics.faction.join({ factionId: factionA, agentId: ids[2], tick: 0 });
  factionB = social.politics.faction.form({ name: '自由民', founderId: ids[1], tick: 0 }).factionId;
  social.politics.leader.elect({ agentId: ids[0], support: 0.5, tick: 0 });
  lawId = social.politics.law.propose({ title: '宵禁令', text: '夜间禁止外出', proposerId: ids[0], tick: 0 }).lawId;

  // 2) culture：规范 + 仪式 + 模因
  social.culture.norms.update({ id: 'no_stealing', valence: 'forbidden', strength: 0.5 });
  social.culture.norms.update({ id: 'sharing', valence: 'accepted', strength: 0.5 });
  const ritualInterval = (Number.isInteger(config.ritualInterval) && config.ritualInterval > 0) ? config.ritualInterval : 2;
  social.culture.ritual.schedule({ name: 'harvest', interval: ritualInterval, purpose: '丰收祭' });
  social.culture.meme.spread({ memeId: 'freedom', fromAgent: ids[0], toAgent: ids[1], tick: 0 });

  // 3) psyche：给首位居民播种接近阈值的创伤（触发崩溃链路）
  agent.psyche.trauma.add({ agentId: ids[0], kind: 'famine', severity: 0.75, source: 'famine', ts: 0 });

  // 4) tech：启动第一项可研究技术
  const t0 = civilization.tech.tree.query().find((t) => t.available);
  if (t0) {
    civilization.tech.research.start({ techId: t0.id, researchers: ids.slice(0, 2), tick: 0 });
    researchesStarted += 1;
  }

  return {
    factions: 2,
    law: true,
    norms: 2,
    ritual: true,
    meme: true,
    trauma: true,
    research: t0 ? t0.id : null,
  };
}

/** 政治：法律表决/执行、派系结盟、冲突升级/调停。 */
function runPolitics(tick, agents) {
  const result = { votes: 0, enacted: false, enforced: false, allied: false, conflict: null };
  const ids = agents.map((a) => a.id);
  if (ids.length < 2 || factionA === null) return result;

  // 法律：表决一次即达简单多数通过，下一 tick 执行一次
  if (lawId !== null && !lawEnforced) {
    const law = social.politics.law.list().find((l) => l.lawId === lawId);
    if (law && law.status === 'proposed') {
      const voted = social.politics.law.vote({ lawId, agentId: ids[0], vote: 'yes', tick });
      result.votes = 1;
      if (voted.status === 'enacted') {
        lawsEnacted += 1;
        result.enacted = true;
      }
    } else if (law && law.status === 'enacted') {
      social.politics.law.enforce({ lawId, agentId: ids[0], violation: 'curfew', penalty: { type: 'fine', amount: 1 }, tick });
      lawEnforced = true;
      result.enforced = true;
    }
  }

  // 派系结盟（一次）
  if (factionA !== null && factionB !== null && !allied) {
    social.politics.faction.ally({ a: factionA, b: factionB, tick });
    allied = true;
    result.allied = true;
  }

  // 冲突：开启一次，强度不足则升级，达到阈值后调停解决
  if (factionA !== null && factionB !== null) {
    if (conflictId === null) {
      const pressure = avgPressure(agents);
      conflictId = social.politics.conflict.start({ partyA: factionA, partyB: factionB, cause: '资源争夺', pressure, tick }).conflictId;
      result.conflict = 'started';
    } else if (!conflictResolved) {
      const c = social.politics.conflict.list().find((x) => x.conflictId === conflictId);
      if (c && c.status === 'open') {
        if (c.intensity >= 0.5) {
          social.politics.conflict.resolve({ conflictId, outcome: 'mediate', mediatorId: ids[0], tick });
          conflictResolved = true;
          conflictsResolved += 1;
          result.conflict = 'resolved';
        } else {
          social.politics.conflict.escalate({ conflictId, delta: 0.2, tick });
          result.conflict = 'escalated';
        }
      }
    }
  }

  return result;
}

/** 文化：周期仪式、规范违规、模因变异。 */
function runCulture(tick, agents) {
  const result = { ritual: false, violated: false, meme: false };
  const ids = agents.map((a) => a.id);

  for (const d of social.culture.ritual.due({ tick })) {
    social.culture.ritual.hold({ name: d.name, tick, participants: ids });
    ritualsHeld += 1;
    result.ritual = true;
  }

  if (ids.length >= 1 && !normViolated) {
    social.culture.norms.violate({ agentId: ids[0], normId: 'no_stealing', tick, context: '偷窃' });
    normViolated = true;
    normsViolated += 1;
    result.violated = true;
  }

  if (tick > 0 && tick % 2 === 0 && !memeMutated) {
    social.culture.meme.mutate({ memeId: 'freedom', tick });
    memeMutated = true;
    memesMutated += 1;
    result.meme = true;
  }

  return result;
}

/** 心理：创伤累积 → 崩溃/恢复判定 → 应对疗愈。 */
function runPsyche(tick, agents, config = {}) {
  const result = { accumulated: 0, breakdown: 0, recovery: 0, coping: 0 };
  const traumaRate = (typeof config.traumaRate === 'number' && Number.isFinite(config.traumaRate) && config.traumaRate >= 0) ? config.traumaRate : 0.2;
  const breakThreshold = (typeof config.breakThreshold === 'number' && config.breakThreshold >= 0 && config.breakThreshold <= 1) ? config.breakThreshold : 0.7;
  for (const a of agents) {
    const acc = agent.psyche.trauma.accumulate({ agentId: a.id, rate: traumaRate });
    if (acc.added > 0) result.accumulated += 1;

    const chk = agent.psyche.break.check({ agentId: a.id, threshold: breakThreshold, tick });
    if (chk.transition === 'breakdown') { breakdowns += 1; result.breakdown += 1; }
    if (chk.transition === 'recovery') { recoveries += 1; result.recovery += 1; }

    const level = agent.psyche.trauma.query({ agentId: a.id }).level;
    if (level > 0.05) {
      agent.psyche.coping.execute({ agentId: a.id });
      copings += 1;
      result.coping += 1;
    }
  }
  return result;
}

/** 科技：推进研究 → 完成突破 → 启动下一项；失传检测。 */
function runTech(tick, agents, config = {}) {
  const result = { progressed: 0, completed: 0, started: 0, lost: 0 };
  const ids = agents.map((a) => a.id);

  const progressed = civilization.tech.research.progress({ n: 1, tick });
  result.progressed = progressed.length;

  for (const rec of civilization.tech.research.pending()) {
    if (rec.done) {
      const node = civilization.tech.tree.query({ techId: rec.techId });
      if (node.available) {
        civilization.tech.research.complete({ techId: rec.techId, tick });
        researchesCompleted += 1;
        result.completed += 1;
      }
    }
  }

  if (civilization.tech.research.pending().length === 0) {
    const next = civilization.tech.tree.query().find((t) => t.available);
    if (next) {
      try {
        civilization.tech.research.start({ techId: next.id, researchers: ids.slice(0, 2), tick });
        researchesStarted += 1;
        result.started += 1;
      } catch { /* 不可研究或已在研究 */ }
    }
  }

  // 失传检测：config.techLoss 时模拟掌握者全亡（空 living 集合）
  const living = config.techLoss === true ? [] : ids;
  const loss = civilization.tech.lock.detect({ living, tick });
  for (const l of loss) {
    if (l.lost) {
      civilization.tech.lock.apply({ techId: l.techId, tick });
      techsLost += 1;
      result.lost += 1;
    }
  }

  return result;
}

/** 文明：崩溃检测 → 确认 → 遗产图谱+描述 → 重启注入下一代。 */
async function runCivilization(tick, agents, config) {
  const result = { collapsed: false, legacy: null, restart: null };
  const population = agents.length;
  const food = survival.resources.food.query();
  const water = survival.resources.water.query();
  const resourceRatio = Math.min(1 - food.scarcity, 1 - water.scarcity);
  const crisisLevel = avgPressure(agents);
  const force = config.collapseForce === true;

  // 资源枯竭需要**持续**才计入：单 tick 见底是水位振荡的正常谷底，不是文明崩溃。
  const scarcityThreshold = 0.9;
  if (1 - resourceRatio >= scarcityThreshold) scarceTicks += 1;
  else scarceTicks = 0;
  const scarceTicksRequired = Number.isInteger(config.collapseScarceTicks) && config.collapseScarceTicks > 0
    ? config.collapseScarceTicks : 12;
  const scarcitySustained = scarceTicks >= scarceTicksRequired;

  const det = civilization.collapse.detector.detect({
    population: force ? 0 : population,
    resourceRatio: scarcitySustained ? resourceRatio : 1,
    crisisLevel,
    survivalTime: tick,
  });
  // 未持续时按真实比值重算综合 score，避免上面的替换掩盖真实状态。
  if (!scarcitySustained) {
    const score = Math.min(1, Math.max(0,
      0.4 * (population <= 0 ? 1 : 0) + 0.3 * (1 - resourceRatio) + 0.3 * crisisLevel));
    det.score = score;
    det.indicators = det.indicators.map((i) => (i.key === 'collapseScore'
      ? { ...i, value: score, critical: score >= 0.6 } : i));
    det.collapsed = (force ? true : population <= 0) || crisisLevel >= 0.8 || score >= det.threshold;
  }
  det.scarceTicks = scarceTicks;
  det.scarcitySustained = scarcitySustained;

  if (det.collapsed && !collapseHandled) {
    collapseHandled = true;
    collapses += 1;
    firstCollapse = {
      tick, reasons: det.reasons, score: det.score, population, resourceRatio, crisisLevel,
      scarceTicks: det.scarceTicks, scarcitySustained: det.scarcitySustained,
    };

    civilization.collapse.confirmer.confirm({
      population: force ? 0 : population,
      resourceRatio,
      crisisLevel,
      tick,
    });

    const prevCivId = 'civ_' + tick;
    const nextCivId = 'civ_next_' + tick;
    const graph = civilization.legacy.graph.build({ civilizationId: prevCivId });
    const facts = civilization.legacy.summary.extractor.extract({ graph });
    const summary = await civilization.legacy.summary.writer.generate({ extract: facts });

    const restarted = await civilization.restart.execute({
      tick,
      reset: typeof config.restartReset === 'function' ? config.restartReset : null,
      civilizationId: prevCivId,
      nextCivilizationId: nextCivId,
      graph,
      summary,
    });
    restarts += 1;

    result.collapsed = true;
    result.legacy = { graph, facts, summary };
    result.restart = restarted;
  }

  return result;
}

/**
 * 推进一个 tick 的第三阶段流程（异步：遗产描述走 LLM）。
 * @param {{ tick: number, agents: Array<{ id: string }>, config?: object }} input
 * @returns {Promise<object>}
 */
export async function tick({ tick, agents, config = {} }) {
  return {
    politics: runPolitics(tick, agents),
    culture: runCulture(tick, agents),
    psyche: runPsyche(tick, agents, config),
    tech: runTech(tick, agents, config),
    civilization: await runCivilization(tick, agents, config),
  };
}

/** 第三阶段累计摘要（供 loop.run 报告与观测）。 */
export function summary() {
  return {
    seeded,
    lawsEnacted,
    conflictsResolved,
    ritualsHeld,
    normsViolated,
    memesMutated,
    breakdowns,
    recoveries,
    copings,
    researchesStarted,
    researchesCompleted,
    techsLost,
    firstCollapse,
    collapses,
    restarts,
  };
}

/** 复位第三阶段全部内存态（图存储由 loop.reset 的 graph.__reset 负责）。 */
export function __reset() {
  seeded = false;
  factionA = null; factionB = null; allied = false;
  lawId = null; lawEnforced = false;
  conflictId = null; conflictResolved = false;
  normViolated = false; memeMutated = false; collapseHandled = false; firstCollapse = null; scarceTicks = 0;
  lawsEnacted = 0; conflictsResolved = 0; ritualsHeld = 0; normsViolated = 0; memesMutated = 0;
  breakdowns = 0; recoveries = 0; copings = 0;
  researchesStarted = 0; researchesCompleted = 0; techsLost = 0; collapses = 0; restarts = 0;

  agent.psyche.trauma.__reset();
  agent.psyche.coping.__reset();
  agent.psyche.break.__reset();
  civilization.tech.tree.__reset();
  civilization.tech.research.__reset();
}
