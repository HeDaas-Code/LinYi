/**
 * truman-town.runtime.state — 运行状态清单 / Runtime State Inventory
 *
 * 把「一次运行中所有必须随存档一起走的状态」集中成一份**显式、有序**的清单，
 * 并提供整份采集（capture）与整份恢复（restore）。
 *
 * 为什么需要它：graph store 只承载了世界的一部分（居民节点、账户、关系、日志……）。
 * 另有大量状态**只活在模块级变量里**——时钟、RNG 流位置、ID 计数器、实体注册表、
 * 世界快照、采集池、配对索引、生育计数、崩溃集合、在研项目、价格表、重试队列……
 * 只快照 graph 的存档在恢复后会得到一个「世界对、进程错」的沙盘：同一批居民，
 * 但从 tick 0 重新计时、随机序列从头重放、配对与生育清空。本模块就是这份缺口清单。
 *
 * 设计取舍：
 * - **显式清单而非自动发现**：模块状态是词法作用域的，JS 无法通用地枚举/写回。
 *   显式清单可审计（谁入了档、谁没入档一眼可见），也比反射更稳。
 * - **顺序有意义**：graph 必须最先恢复（其余模块的派生索引按它的代数失效重建），
 *   semantic 必须紧随其后（它要把 lastGeneration 对齐到 graph 的新代数）。
 * - **派生缓存不入档**：凡按 graph.__generation() 或 tick 自失效的缓存
 *   （episodic/posts/reputation/trauma 的 byAgent、personality 的 profileCache、
 *   tagset 的 readCache、timeline 的 cache、chronicle 的 segments、laya 的 cache）
 *   一律不入档——恢复后自动重建。把它们写进存档只会制造「索引与图不一致」的机会。
 * - **kind 标注用途**：'core' 为仿真正状态（缺失即分叉）；'control' 为控制面（相位、序号）。
 */

import * as graph from '../infra/store/graph.js';
import * as clock from './clock.js';
import * as registry from './registry.js';
import * as worldState from './world-state.js';
import * as rng from '../infra/rng.js';
import * as identity from '../infra/identity.js';
import * as config from '../infra/config.js';
import * as retry from '../infra/events/retry.js';
import * as loop from './orchestrator/loop.js';
import * as dispatch from './orchestrator/dispatch.js';
import * as stage2 from './orchestrator/_stage2.js';
import * as stage3 from './orchestrator/_stage3.js';

import * as semantic from '../agent/memory/semantic.js';
import * as reputation from '../social/reputation.js';
import * as episodic from '../agent/memory/episodic/store.js';
import * as trauma from '../agent/psyche/trauma.js';
import * as posts from '../social/platform/posts.js';
import * as interaction from '../social/interaction.js';
import * as outcomeModel from '../agent/decision/outcome-model.js';
import * as goals from '../agent/decision/goals.js';
import * as contention from '../agent/decision/contention.js';
import * as meter from '../survival/needs/meter.js';
import * as disease from '../survival/health/disease.js';
import * as epidemic from '../survival/health/epidemic.js';
import * as weather from '../survival/environment/weather.js';
import * as radiation from '../survival/environment/radiation.js';
import * as breakMod from '../agent/psyche/break.js';
import * as coping from '../agent/psyche/coping.js';
import * as recipe from '../agent/crafting/recipe.js';
import * as craftJobs from '../agent/crafting/workbench/executor.js';
import * as buildJobs from '../agent/crafting/construction.js';
import * as writeJobs from '../agent/crafting/writing.js';
import * as item from '../agent/inventory/item.js';
import * as backpack from '../agent/inventory/backpack.js';
import * as price from '../economy/market/price.js';
import * as credit from '../economy/bank/credit.js';
import * as tax from '../economy/tax.js';
import * as txRecorder from '../economy/ledger/transaction/recorder.js';
import * as research from '../civilization/tech/research.js';
import * as logSeq from '../observer/recorder/_shared.js';
import * as hotLog from '../infra/store/hot-log.js';
import * as stageProgress from './orchestrator/stage-progress.js';

/**
 * 状态清单。顺序即恢复顺序，不可随意调整：
 *   graph → semantic（对齐代数）→ 其余。
 */
export const SECTIONS = Object.freeze([
  { name: 'graph', kind: 'core', module: graph, description: '图存储全量节点（居民/账户/建筑/关系/日志/编年段）' },
  { name: 'semantic', kind: 'core', module: semantic, description: '语义记忆内存索引（persist:false 的条目只在内存里）' },
  // 以下四个索引承载「图里没有」的部分（history / replies / 事件链 / 追加顺序）。
  // 它们同时也是「清空即重建」缺陷的修复点：ensureFresh 现在会从图重建，
  // 而内存专属部分由这里的入档保留。
  { name: 'reputation', kind: 'core', module: reputation, description: '声誉索引（history 只在内存）' },
  { name: 'episodic', kind: 'core', module: episodic, description: '情景记忆索引' },
  { name: 'trauma', kind: 'core', module: trauma, description: '创伤事件链（只在内存）' },
  { name: 'posts', kind: 'core', module: posts, description: '社交平台帖子索引（replies 只在内存）' },
  // t13：双向互动与承诺记录。**必须入档**：未结承诺（谁欠谁什么）是跨 tick 的
  // 社会事实，不入档则恢复后"欠债"消失、履约/违约无从判定、信任回落到中性。
  { name: 'interaction', kind: 'core', module: interaction, description: '双向互动与承诺记录（请求/接受/拒绝/履约/违约）' },
  // 结果学习证据表：逐 tick 累积、直接参与打分、只活在内存（无 graph 节点）。
  { name: 'outcomeModel', kind: 'core', module: outcomeModel, description: '结果学习证据表（状态-行动-收益）' },
  // 目标规划状态：在办计划（含 stepIndex/deadline/attempts）、放弃冷却、累计统计。
  // 与 outcomeModel 同类——逐 tick 累积、直接参与决策，却只活在内存里。
  // 不入档则续跑时计划从第 0 步重来、冷却窗口消失、统计归零（见 goals.__snapshot 注释）。
  { name: 'goals', kind: 'core', module: goals, description: '目标规划状态（在办计划/放弃冷却/累计统计）' },
  // 共享池争用账本。注意：它与 goals/outcomeModel **不同类**——本账本每 tick 由
  // open(tick, capacities) 从真实世界整表重建，属**派生**状态（实测：不接本 section
  // 时跨进程摘要已逐字节一致）。入档是为了不让正确性依赖"open 恰好先跑"这个时序巧合，
  // 详见 contention.__snapshot 的注释与实测记录。
  { name: 'contention', kind: 'core', module: contention, description: '共享池争用账本（容量/已预支/当前 tick）' },
  // 阶段进度的**可恢复子集**（t25）。它只带 backgroundDriver 一个字段，这是刻意的：
  // recent 历史与 currentTick 属观测杂质/半提交态，入档会破坏 t16 的
  // 「恢复后 recent.length === 0」契约。判读要点——
  //   「零入边 = 没人读」这条静态判读在这里**成立且是期望的**：recent 确实没有
  //   持久化消费者，别把「看起来缺字段」当成缺口。
  // 详见 stage-progress.js 头部「恢复边界」表。
  { name: 'stageProgress', kind: 'core', module: stageProgress, description: '阶段进度可恢复子集（仅后台驱动器事实；recent/currentTick 刻意不入档）' },
  { name: 'clock', kind: 'core', module: clock, description: '世界时钟 tick 与周期任务描述' },
  { name: 'rng', kind: 'core', module: rng, description: '主随机源种子与流位置' },
  { name: 'identity', kind: 'core', module: identity, description: '实体 ID 发号计数器' },
  { name: 'registry', kind: 'core', module: registry, description: '实体注册表（主循环人口事实来源）' },
  { name: 'worldState', kind: 'core', module: worldState, description: '世界状态快照（点分路径树）' },
  { name: 'config', kind: 'control', module: config, description: '难度档位选择' },
  { name: 'loop', kind: 'core', module: loop, description: '采集池/死亡计量/识字者/提交边界' },
  { name: 'dispatch', kind: 'control', module: dispatch, description: '行动序号' },
  { name: 'recorderSeq', kind: 'control', module: logSeq, description: '观察者日志写入序号' },
  { name: 'logArchive', kind: 'control', module: hotLog, description: '决策/行为/事件/帖子的热上限归档与序号水位' },
  { name: 'stage2', kind: 'core', module: stage2, description: '阶段二全部模块级状态（配对/生育/企业/平台流）' },
  { name: 'stage3', kind: 'core', module: stage3, description: '阶段三全部模块级状态（阵营/法令/冲突/研究计数）' },
  { name: 'meter', kind: 'core', module: meter, description: '居民需求（饥饿/口渴）' },
  { name: 'disease', kind: 'core', module: disease, description: '居民健康与疾病' },
  { name: 'epidemic', kind: 'core', module: epidemic, description: '隔离名单' },
  { name: 'weather', kind: 'core', module: weather, description: '当前天气与倒计时' },
  { name: 'radiation', kind: 'core', module: radiation, description: '辐射网格' },
  { name: 'breakdown', kind: 'core', module: breakMod, description: '已崩溃居民集合' },
  { name: 'coping', kind: 'core', module: coping, description: '进行中的应对策略' },
  { name: 'recipe', kind: 'core', module: recipe, description: '配方表与居民已学配方' },
  // 三个在途任务队列是**闭包内**状态（见 _jobs.js）：扫模块级变量看不见它们，
  // 但 remainingTicks 是跨 tick 的进度，不入档会让在途的制作/建造/写作凭空消失。
  { name: 'craftJobs', kind: 'core', module: craftJobs, description: '在途制作任务队列' },
  { name: 'buildJobs', kind: 'core', module: buildJobs, description: '在途建造任务队列' },
  { name: 'writeJobs', kind: 'core', module: writeJobs, description: '在途写作任务队列' },
  { name: 'item', kind: 'core', module: item, description: '物品目录' },
  { name: 'backpack', kind: 'core', module: backpack, description: '居民背包' },
  { name: 'price', kind: 'core', module: price, description: '市场已发现价格' },
  { name: 'credit', kind: 'core', module: credit, description: '金库账户引用' },
  { name: 'tax', kind: 'core', module: tax, description: '税收池账户引用' },
  { name: 'txSeq', kind: 'control', module: txRecorder, description: '流水序号' },
  { name: 'research', kind: 'core', module: research, description: '在研项目进度' },
  { name: 'retry', kind: 'core', module: retry, description: '事件重试队列与死信' },
]);

/** 采集全部运行状态。 */
export function capture() {
  const sections = {};
  const captured = [];
  const skipped = [];
  for (const sec of SECTIONS) {
    const fn = sec.module.__snapshot;
    if (typeof fn !== 'function') { skipped.push(sec.name); continue; }
    sections[sec.name] = fn();
    captured.push(sec.name);
  }
  return { sections, captured, skipped };
}

/**
 * 恢复全部运行状态（按 SECTIONS 顺序）。
 * 缺失的 section 跳过（向后兼容旧档）；core 缺失记入 missing。
 */
export function restore(sections = {}) {
  if (sections === null || typeof sections !== 'object' || Array.isArray(sections)) {
    throw new TypeError('runtime.state.restore: sections 必须为普通对象');
  }
  const restored = [];
  const missing = [];
  const skipped = [];
  for (const sec of SECTIONS) {
    const fn = sec.module.__restore;
    if (typeof fn !== 'function') { skipped.push(sec.name); continue; }
    if (!Object.prototype.hasOwnProperty.call(sections, sec.name)) {
      if (sec.kind === 'core') missing.push(sec.name);
      continue;
    }
    fn(sections[sec.name]);
    restored.push(sec.name);
  }
  return { restored, missing, skipped };
}

/**
 * 某个 section 的快照字段**恢复语义分类**。
 *
 * section 模块可以导出 SNAPSHOT_FIELD_KINDS 来声明：
 *   { 字段名: 'state' | 'observation' }
 *   'state'       —— 可恢复的行为状态，跨进程必须逐位一致
 *   'observation' —— 本进程的观测元数据，刻意不恢复，跨进程预期不同
 *
 * 为什么要有这个查询口：存档比对 / 跨进程等价摘要必须知道该排除谁。
 * 让分类**由拥有该语义的模块自己声明**，而不是让每个比较方各自硬编码——
 * 硬编码的代价是实测过的：把 stageProgress.dropped 当行为状态严格比对，
 * 4/6/10/20 人口下每一个 tick 都会被误判为恢复分叉（t27）。
 *
 * 未声明分类的 section 返回空对象，表示「没有观测字段，整体都可恢复」。
 * @param {string} name section 名
 * @returns {Record<string, 'state'|'observation'>}
 */
export function sectionFieldKinds(name) {
  const sec = SECTIONS.find((s) => s.name === name);
  const declared = sec?.module?.SNAPSHOT_FIELD_KINDS;
  if (declared === null || typeof declared !== 'object') return {};
  const out = {};
  for (const [field, kind] of Object.entries(declared)) {
    if (kind === 'state' || kind === 'observation') out[field] = kind;
  }
  return out;
}

/** 清单元数据（不含数据），供 API/文档展示「一次存档里有什么」。 */
export function inventory() {
  return SECTIONS.map((sec) => ({
    name: sec.name,
    kind: sec.kind,
    description: sec.description,
    hasSnapshot: typeof sec.module.__snapshot === 'function',
    hasRestore: typeof sec.module.__restore === 'function',
    // 声明了恢复语义分类的 section 才带此字段（目前只有 stageProgress）。
    fieldKinds: sectionFieldKinds(sec.name),
  }));
}

/** 校验一份 sections 是否覆盖全部 core section（完整存档判定）。 */
export function validate(sections = {}) {
  const known = new Set(SECTIONS.map((s) => s.name));
  const missing = SECTIONS.filter((s) => s.kind === 'core' && !Object.prototype.hasOwnProperty.call(sections, s.name)).map((s) => s.name);
  const extra = Object.keys(sections ?? {}).filter((k) => !known.has(k));
  return { ok: missing.length === 0, missing, extra };
}
