/**
 * truman-town.infra.config — 配置管理 / Config
 *
 * 统一读写沙盘运行参数：以 graph store 作为持久化基座（type=config，
 * key 支持点分路径），并提供参数默认值快照（defaults）与校验（validate /
 * resolve），供 loop / _stage2 / _stage3 / bench 复用，保证外提参数一处定义、
 * 全局一致。
 */

import * as graph from './store/graph.js';

const CONFIG_TYPE = 'config';
const CONFIG_PREFIX = 'config:';

// ---- 默认值快照（外提参数唯一事实来源，冻结） ----

/** 沙盘参数默认值。 */
export const DEFAULTS = Object.freeze({
  decay: Object.freeze({ food: 0.01, water: 0.01, energy: 0.01, medical: 0.005 }),
  needGrowth: Object.freeze({ food: 0.08, water: 0.08 }),
  eventProbability: 0.3,
  epidemicThreshold: 0.5,
  procreationMatchThreshold: 0.3,
  tagCount: 50,
  sharedTagCount: 45,
  ritualInterval: 2,
  traumaRate: 0.2,
  breakThreshold: 0.7,
  starvationThreshold: 0.9,
  starvationTicks: 5,
  starvationHealthDecline: 0.2,
  eatThreshold: 0.4,
  // P2：**危机**阈值——只有需求达到此水平，日程才允许结果性覆盖居民的决定。
  // 必须显著高于 eatThreshold(0.4)，否则「该吃饭了」会被当成「快死了」，
  // 日程词汇表在需求长期处于 0.4~0.5 的大规模局里整体接管决策。
  crisisNeedLevel: 0.8,
  forageYield: 2,
  // P2：采集带回木材的概率。木头原先只在出生时一次性发放、无再生途径，
  // 导致 craft/build 的窗口只在开局几次后永久关闭。
  // 0.25 → 0.45：build 需 3 个木材、craft 需 2 个，而采集次数被收紧后木材供给不足
  // （实测 build 后期掉到 0-3 次）。提高带回概率让"建造"重新具备可行性。
  forageWoodChance: 0.45,
  // P2：采集池必须与规模匹配。原 perCapita 值（容量 1.0、再生 0.15）在 52 人时
  // 只够每 tick 7.9 次采集，而 52 人全被评分奖励去采 → 池瞬间抽干、采集变空转。
  // 提到容量 2.0 / 再生 0.35：52 人时可支持约 20 次采集/tick，与人口量级相称。
  // P2：再生速率必须**全部按人均计价**。固定基数（forageRegen）在大规模下被稀释：
  // 原 (regen 9 + 0.18/人) 在 50 人时支持 9.2 次采集/tick（0.18/人），
  // 在 120 人时只支持 15.5 次（0.13/人）——人均采集机会随规模**下降**。
  // 木材只从采集获得，于是 craft 在 80/120 人时从 323 崩到 6/10（制作灭绝）。
  // 把基数并入人均项，使人均采集机会与规模无关。
  foragePoolCapacity: 32,
  forageRegen: 0,
  foragePoolPerCapita: 2.0,
  // P3：0.40 实测**过剩**——50 人 200 tick 下人均库存长期钉在 3.8 且水食双双顶满 200/200，
  // 52 人中无一人需求超过 0.7（最高 0.36），采集池容量 136 只用了 28。
  // 「0 死亡」因此不是求生成功，而是资源过剩；刚性生存门被误判为"死板"的根源也在此。
  // 临界扫描（50 人 × 200 tick × seed1/42）：再生 0.30 存活 104/104 且门开率 5%；
  // 再生 0.25 跌到 92/104、门开率 97%、非生存行为占比由 0.54 坍塌到 0.06。
  // 取临界之上的 0.30，使压力真实存在但仍可持续。
  forageRegenPerCapita: 0.30,
  // P3：4 单位/人 × 200 tick 意味着整局无需采集即可存活。降到 2.5，
  // 使开局储备只够缓冲、必须靠持续采集与制作维持（实测最低人均会触底 0 后回升，
  // 即真实出现过短缺并靠行为恢复，而非从未短缺）。容量须同步下调，否则等于没降。
  initialReservePerCapita: 2.5,
  reserveCapacityPerCapita: 3,
  bankCapital: 500,
  creditRate: 0.01,
  interestMode: 'simple',
  taxRate: 0.002,
  taxInterval: 20,
  // 产业经济（t42 批次1修复：闭合货币环 + 破产可达 + 能源医疗挂钩人口）
  businessCount: 2,
  businessCapital: 80,
  goodsPrice: 7,
  productionOutput: 4,
  energyInput: 4,
  energyPrice: 2,
  rawInput: 4,
  rawPrice: 1,
  wage: 3,
  goodsDemandPerCapita: 0.12,
  // 消费保留额：居民账户超过此额度的「闲钱」才转化为商品需求。
  // 需求因此由**真实财富分布**内生决定，市场容量不再是固定常数——
  // 这是企业出生能跨种子分化（涌现）的前提。
  consumptionReserve: 400,
  priceVolatility: 0.4,
  residentEnergyUse: 0.2,
  energyRegen: 20,
  bankruptcyThreshold: 10,
  infectionRate: 0.03,
  treatPerCapita: 0.02,
  medicalRegenPerCapita: 0.5,
  // 避难所容量与修复（t43：容量约束真实生效 + 危机信号可恢复）
  shelterBaseCapacity: 54,
  shelterRepairRate: 1,
  exposureNeedGrowth: 0.01,
  supplyRedistributeInterval: 20,
  // 批次2-A 人格与生命周期（自然衰老死亡默认 200 tick 内不触发 + 特质演化）
  ageRatePerTick: 1 / 365,
  initialAgeMin: 20,
  initialAgeMax: 50,
  lifecycleAdultStart: 18,
  lifecycleElderStart: 65,
  lifecycleElderMortalityRate: 0.01,
  traitDriftRate: 0.05,
  traitDriftInterval: 10,
  traitMutateRate: 0.02,
  // 批次2-B 智能体记忆 / 预演 / 决策解释（t47）
  // P1：行动空间已从 4 种扩到 12 种，窗口 4 会把社交/求偶类行动永久挤出（等于又替居民做了选择）。
  // 候选修剪上限。**必须与 shortlist 的带宽匹配**，否则后面的闸门会把
  // 前面刚放进来的候选又切掉（实测：shortlist(12) 之后 prune(k=6) 仍只留 6 个，
  // build 被 craft 挤掉，60 tick 小局里 built=0、action-log 无建造记录）。
  // 12 = 骨架 4（eat/drink/rest/forage）+ 发展 4（found/socialize/court/accept）
  //      + 生产/交换 4（craft/build/work/trade）。
  pruneK: 12,
  // 识字个人化：社会存在识字供给（教师在职）时，成年居民中实际识字的比例。
  // 为什么不直接用 society.teacher 的 literacyRate：那是**能力系数**（0.05，
  // 在 tech.research 里以 *4 作连续加成），不是人口比例；直接当比例会让
  // 50 人里仅 2~3 人识字，实测三种子 write 恒为 0（写书行动灭绝）。
  literacyShare: 0.4,
  simNoise: 0.5,
  semanticMaxEntries: 64,
  semanticLimit: 3,
  // 生育上限（每次运行）。此前在 _stage2 里硬编码为 2，导致任何一次运行
  // 最多出生 2 人、家族永远停在两代，「三代未遗失固化为家族特质」不可达。
  // 实测 50×200 tick 单种子：上限 8 → 人口 58、最大第 1 代、0 个家族有特质；
  // 上限 24 → 人口 74、最大第 3 代、1 个家族固化特质；
  // 上限 60 → 人口 98、最大第 5 代、8 个家族固化特质。三者存活均 100%。
  // 取 24：让「三代固化」在**标准 200 tick 局**里就可观测，同时人口只增约五成。
  maxChildrenPerRun: 24,
  scheduleEnabled: true,
  scheduleLength: 12,
  careerEnabled: true,
  societyEnabled: true,
  // 批次2-D：社区发现重算间隔（每 N tick 重算一次，避免每 tick 全量重算拖慢长跑）
  communityDetectInterval: 10,
  // 批次2-E：社交平台与声誉（t50）
  postRate: 0.08,
  replyRate: 0.12,
  reactRate: 0.25,
  feedSize: 8,
  feedInterval: 10,
  reputationTriageEnabled: true,
  reputationTriageBoost: 1.0,
  reputationPurchaseGain: 0.1,
  reputationSaleGain: 1,
  reputationDefaultPenalty: 30,
  reputationReplyGain: 0.5,
  reputationUpvoteGain: 0.05,
  reputationDownvotePenalty: 0.3,
  reputationCreditEnabled: true,
  reputationCreditBoost: 0.5,
  actionSpaceEnabled: true,
  // 有模型 E2E：让真实大模型从候选集中选行动（默认关闭，保证空跑确定性与速度）。
  // 实测 grok-4.6 单次约 18s，故用 llmDecideEveryTicks / llmDecideMaxAgents 控制规模。
  llmDecideEnabled: false,
  llmDecideEveryTicks: 1,
  llmDecideMaxAgents: 1,
  actionSpaceAttribution: false,
  // 生存门：人均库存低于该值时，非生存行动在打分侧受到额外惩罚。
  // 这必须是「真实短缺」判据，不能是「理想储备」判据：3.0 在 50 人规模下永不可达
  //（实测人均库存长期停在 1.4-1.8），门因此恒开，等于把全城钉在永久应急态。
  // P2 起门**不再删除候选**（旧实现在受威胁时把非生存行动从窗口移除），
  // 只作为软压制的一个分量参与打分。
  survivalGatePerCapita: 1.5,
  // P2：非生存行动的连续软压制权重。惩罚 = weight × pressureScore（pressureScore ∈ [0,1]），
  // 因此有上限、永不清零——人格/动机/预演仍可把非生存行动顶回来。
  // 取代了旧实现「受威胁即删除候选 + 硬扣 5 分」的刚性门（用户明确否掉）。
  nonSurvivalPressureWeight: 4,
  // P2：LAYA 语义紧迫度接入开关。默认关闭——它是**加权项**（压力分的 15%），
  // 开启后需要本地 LAYA 服务可用；不可用时静默回退，决策链不受影响。
  layaSemanticEnabled: false,
  // P2：每 tick 允许调用 LAYA 的居民上限。实测全量预取（20 人 30 tick）耗 78s，
  // 未开启时仅 0.45s；只对已达进食阈值者调用后，调用量降到个位数且覆盖真正需要判断的人。
  layaMaxAgents: 8,
});

/** 返回默认值深拷贝快照。 */
export function defaults() {
  return structuredClone(DEFAULTS);
}
// ---- 难度档位预设（产品化：把 needGrowth 与采集池暴露为可切换档位） ----

/**
 * 四档难度预设。standard 档参数严格等于 DEFAULTS 对应字段，保证既有行为不变；
 * 其余各档给出实测预期存活表现（引用 reports/bench-tuned.md 与 t33 验收数据）。
 */
export const DIFFICULTY_PRESETS = Object.freeze({
  peaceful: Object.freeze({
    label: '和平 / Peaceful',
    expected: '50 居民默认局稳定存活 200 tick 且资源富余（needGrowth 0.04 < 生存阈值约 0.06）',
    params: Object.freeze({
      needGrowth: Object.freeze({ food: 0.04, water: 0.04 }),
      eventProbability: 0.15,
      foragePoolCapacity: 40,
      forageRegen: 12,
      foragePoolPerCapita: 2.6,
      forageRegenPerCapita: 0.5,
      initialReservePerCapita: 6,
      reserveCapacityPerCapita: 6,
    }),
  }),
  standard: Object.freeze({
    label: '标准 / Standard',
    expected: '50 居民默认局存活 200 tick（t33：needGrowth 0.08 死亡 tick 中位 200）；当前默认档',
    params: Object.freeze({
      needGrowth: Object.freeze({ food: DEFAULTS.needGrowth.food, water: DEFAULTS.needGrowth.water }),
      eventProbability: DEFAULTS.eventProbability,
      foragePoolCapacity: DEFAULTS.foragePoolCapacity,
      forageRegen: DEFAULTS.forageRegen,
      foragePoolPerCapita: DEFAULTS.foragePoolPerCapita,
      forageRegenPerCapita: DEFAULTS.forageRegenPerCapita,
      initialReservePerCapita: DEFAULTS.initialReservePerCapita,
      reserveCapacityPerCapita: DEFAULTS.reserveCapacityPerCapita,
    }),
  }),
  harsh: Object.freeze({
    label: '严酷 / Harsh',
    expected: '50 居民约 33~46 tick 全灭（t33：needGrowth 0.12 死亡 tick 中位 33~46）',
    params: Object.freeze({
      needGrowth: Object.freeze({ food: 0.12, water: 0.12 }),
      eventProbability: 0.3,
      foragePoolCapacity: 30,
      forageRegen: 0,
      foragePoolPerCapita: 1.6,
      forageRegenPerCapita: 0.22,
      // 严酷档的初始储备本就稀少（人均 1.5，避难所几乎见底）——这是"难度"的来源之一。
      initialReservePerCapita: 1.5,
      reserveCapacityPerCapita: 3,
      businessCapital: 80,
      goodsDemandPerCapita: 0.1,
      rawPrice: 3,
      energyPrice: 2,
      wage: 4,
      priceVolatility: 0.5,
    }),
  }),
  apocalyptic: Object.freeze({
    label: '末日 / Apocalyptic',
    expected: '50 居民约 17~19 tick 全灭（t33：needGrowth 0.16 死亡 tick 中位 19）',
    params: Object.freeze({
      needGrowth: Object.freeze({ food: 0.16, water: 0.16 }),
      eventProbability: 0.3,
      foragePoolCapacity: 30,
      forageRegen: 0,
      foragePoolPerCapita: 1.2,
      forageRegenPerCapita: 0.15,
      // 末日档储备近乎为零，采集也最贫瘠。
      initialReservePerCapita: 1.0,
      reserveCapacityPerCapita: 2,
      businessCapital: 50,
      goodsDemandPerCapita: 0.05,
      rawPrice: 4,
      energyPrice: 3,
      wage: 5,
      priceVolatility: 0.6,
    }),
  }),
});

/** 全部可用档位 id（按定义顺序）。 */
export function difficultyIds() {
  return Object.keys(DIFFICULTY_PRESETS);
}

/** 返回全部档位深拷贝（含 label/expected/params）。 */
export function difficultyPresets() {
  return structuredClone(DIFFICULTY_PRESETS);
}

/**
 * 返回指定档位的运行参数深拷贝（仅 params），未知档位返回 null。
 * @param {string} id
 * @returns {object|null}
 */
export function difficultyParams(id) {
  const preset = DIFFICULTY_PRESETS[id];
  return preset ? structuredClone(preset.params) : null;
}

/** 当前档位 id（默认 standard，保证既有行为不变）。 */
let currentDifficultyId = 'standard';

/** 当前档位快照 { id, label, expected, params }。 */
export function getDifficulty() {
  const preset = DIFFICULTY_PRESETS[currentDifficultyId];
  return {
    id: currentDifficultyId,
    label: preset.label,
    expected: preset.expected,
    params: structuredClone(preset.params),
  };
}

/**
 * 切换当前档位（校验 id，未知档位抛 RangeError）。
 * @param {string} id
 * @returns {object} 切换后的档位快照
 */
export function setDifficulty(id) {
  if (!DIFFICULTY_PRESETS[id]) {
    throw new RangeError(
      'config: 未知难度档位「' + String(id) + '」（可用：' + difficultyIds().join(' / ') + '）',
    );
  }
  currentDifficultyId = id;
  return getDifficulty();
}

/** 当前档位的运行参数（供 loop 作为基础参数叠加，深拷贝）。 */
export function currentDifficultyParams() {
  return structuredClone(DIFFICULTY_PRESETS[currentDifficultyId].params);
}


// ---- 校验 ----

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isUnit(v) {
  return isNum(v) && v >= 0 && v <= 1;
}

function isNonNeg(v) {
  return isNum(v) && v >= 0;
}

function isPosInt(v) {
  return Number.isInteger(v) && v > 0;
}

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

function rateObject(v, hi) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = ['food', 'water', 'energy', 'medical'];
  let any = false;
  for (const k of keys) {
    if (v[k] === undefined) continue;
    any = true;
    if (!(isNum(v[k]) && v[k] >= 0 && v[k] <= hi)) return false;
  }
  return any;
}

/** 校验规则：返回 true（通过）或错误消息字符串。 */
const RULES = {
  decay: (v) => (rateObject(v, 1) ? true : 'decay.food/water/energy/medical 必须是 [0,1] 区间数值'),
  needGrowth: (v) => (rateObject(v, Infinity) ? true : 'needGrowth.food/water 必须是非负有限数值'),
  eventProbability: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  epidemicThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  procreationMatchThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  tagCount: (v) => (isPosInt(v) ? true : '必须是正整数'),
  sharedTagCount: (v) => (isNonNegInt(v) ? true : '必须是非负整数'),
  ritualInterval: (v) => (isPosInt(v) ? true : '必须是正整数'),
  traumaRate: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  breakThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  starvationThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  starvationTicks: (v) => (isPosInt(v) ? true : '必须是正整数'),
  starvationHealthDecline: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  eatThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  crisisNeedLevel: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  nonSurvivalPressureWeight: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  layaSemanticEnabled: (v) => (typeof v === 'boolean' ? true : '必须是布尔值'),
  layaMaxAgents: (v) => (isNonNegInt(v) ? true : '必须是非负整数'),
  forageYield: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  foragePoolCapacity: (v) => ((isNum(v) && v > 0) ? true : '必须是正有限数值'),
  forageRegen: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  foragePoolPerCapita: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  forageRegenPerCapita: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  initialReservePerCapita: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  reserveCapacityPerCapita: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  bankCapital: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  creditRate: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  interestMode: (v) => ((v === 'simple' || v === 'compound') ? true : "必须是 'simple' 或 'compound'"),
  taxRate: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  taxInterval: (v) => (isPosInt(v) ? true : '必须是正整数'),
  shelterBaseCapacity: (v) => (isPosInt(v) ? true : '必须是正整数'),
  shelterRepairRate: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  exposureNeedGrowth: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  ageRatePerTick: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  initialAgeMin: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  initialAgeMax: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  lifecycleAdultStart: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  lifecycleElderStart: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  lifecycleElderMortalityRate: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  traitDriftRate: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  traitDriftInterval: (v) => (isPosInt(v) ? true : '必须是正整数'),
  traitMutateRate: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  pruneK: (v) => (isPosInt(v) ? true : '必须是正整数'),
  simNoise: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  semanticMaxEntries: (v) => (isPosInt(v) ? true : '必须是正整数'),
  semanticLimit: (v) => (isNonNegInt(v) ? true : '必须是非负整数'),
  maxChildrenPerRun: (v) => (isNonNegInt(v) ? true : '必须是非负整数'),
  scheduleEnabled: (v) => (typeof v === 'boolean' ? true : '必须是布尔值'),
  scheduleLength: (v) => (isPosInt(v) ? true : '必须是正整数'),
  careerEnabled: (v) => (typeof v === 'boolean' ? true : '必须是布尔值'),
  societyEnabled: (v) => (typeof v === 'boolean' ? true : '必须是布尔值'),
  communityDetectInterval: (v) => (isPosInt(v) ? true : '必须是正整数'),
  actionSpaceEnabled: (v) => (typeof v === 'boolean' ? true : '必须是布尔值'),
  actionSpaceAttribution: (v) => (typeof v === 'boolean' ? true : '必须是布尔值'),
  survivalGatePerCapita: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  forageWoodChance: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  llmDecideEnabled: (v) => (typeof v === 'boolean' ? true : '必须是布尔值'),
  llmDecideEveryTicks: (v) => (isPosInt(v) ? true : '必须是正整数'),
  llmDecideMaxAgents: (v) => (isPosInt(v) ? true : '必须是正整数'),
};

/**
 * 校验一组参数覆盖（只校验已知键，忽略未知键；不落盘）。
 * @param {Record<string, unknown>} [values]
 * @returns {{ ok: boolean, errors: Array<{ key: string, message: string }> }}
 */
export function validate(values = {}) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    return { ok: false, errors: [{ key: '<root>', message: 'values 必须为普通对象' }] };
  }
  const errors = [];
  for (const [key, rule] of Object.entries(RULES)) {
    if (values[key] === undefined) continue;
    const res = rule(values[key]);
    if (res !== true) errors.push({ key, message: res });
  }
  if (
    values.sharedTagCount !== undefined && values.tagCount !== undefined
    && Number.isInteger(values.sharedTagCount) && Number.isInteger(values.tagCount)
    && values.sharedTagCount > values.tagCount
  ) {
    errors.push({ key: 'sharedTagCount', message: 'sharedTagCount 不得大于 tagCount' });
  }
  return { ok: errors.length === 0, errors };
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v === undefined) continue;
    if (
      v !== null && typeof v === 'object' && !Array.isArray(v)
      && out[k] !== null && typeof out[k] === 'object' && !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * 把一组覆盖深度合并到默认值之上并校验。
 * @param {Record<string, unknown>} [values]
 * @returns {{ config: object, ok: boolean, errors: Array<{ key: string, message: string }> }}
 */
export function resolve(values = {}) {
  const merged = deepMerge(defaults(), values ?? {});
  const v = validate(merged);
  return { config: merged, ok: v.ok, errors: v.errors };
}

// ---- 统一读写（graph store 持久化） ----

function nodeId(key) {
  return CONFIG_PREFIX + key;
}

function assertKey(key) {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new TypeError('config: key 必须为非空字符串');
  }
}

/**
 * 写入单个配置项。
 * @param {string} key
 * @param {unknown} value 任意可结构化克隆的值
 * @returns {unknown} 已写入的值快照
 */
export function set(key, value) {
  assertKey(key);
  if (value === undefined) {
    throw new TypeError('config.set: value 不能为 undefined（如需删除请显式写入 null）');
  }
  graph.write({
    id: nodeId(key),
    type: CONFIG_TYPE,
    data: { key, value },
  });
  return structuredClone(value);
}

/**
 * 批量合并配置（对象形式）。
 * @param {Record<string, unknown>} values
 * @returns {Record<string, unknown>} 已写入的完整配置快照
 */
export function setMany(values) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    throw new TypeError('config.setMany: values 必须为普通对象');
  }
  for (const [key, value] of Object.entries(values)) {
    set(key, value);
  }
  return get();
}

/**
 * 读取配置。
 * - get()        → 全部配置（对象）
 * - get(key)     → 单个配置值；缺失返回 undefined
 * @param {string} [key]
 * @returns {unknown}
 */
export function get(key) {
  if (key === undefined) {
    const all = graph.read({ type: CONFIG_TYPE });
    const out = {};
    for (const node of all) {
      if (node.data && typeof node.data.key === 'string') {
        out[node.data.key] = structuredClone(node.data.value);
      }
    }
    return out;
  }
  assertKey(key);
  const node = graph.read({ id: nodeId(key) });
  return node && node.data ? structuredClone(node.data.value) : undefined;
}

/** 复位底层 graph store（测试 / 复位用，会清空图内全部节点）。 */
export function __reset() {
  graph.__reset();
  currentDifficultyId = 'standard';
}
