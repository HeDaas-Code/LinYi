/**
 * truman-town.social.facts — 世界事实目录 / World Fact Catalog
 *
 * t13 的**事实校验门**：自然语言要影响关系、声誉与后续行为，必须先在这里
 * 被世界状态证实。本模块是"什么算事实"的唯一定义处。
 *
 * 设计取舍：
 * - **读写器而非布尔断言**：每条事实都注册一个 `read(world)`，返回该主体在世界里的
 *   **真实值**（数量/状态），校验做的是"声明值 vs 真实值"的比较，而不是查表。
 *   这样"声称有 3 份食物而实际有 0 份"会被判为假，而不是"food 这个词出现过"就为真。
 * - **目录外即未证实**：未注册的 key 一律 reason='unknown_fact_key'。宁可少认，
 *   不可多认——多认一次就是把伪事实写进了社会关系。
 * - **世界视图显式传入**：collect() 把本 tick 需要的真实世界读成一个普通对象，
 *   verify() 是纯函数。这样事实校验可单测、可复算，不依赖调用时的隐式全局状态。
 */

import * as item from '../agent/inventory/item.js';
import * as backpack from '../agent/inventory/backpack.js';
import * as meter from '../survival/needs/meter.js';
import * as disease from '../survival/health/disease.js';
import * as registry from '../runtime/registry.js';
import * as worldState from '../runtime/world-state.js';
import * as role from '../agent/role/career.js';
import * as society from '../agent/role/society.js';
import * as schedule from '../agent/schedule/planner.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, typeof v === 'number' && Number.isFinite(v) ? v : 0));
}

/**
 * 物品名 → id（懒解析，物品目录由 seed 建立/重建）。
 *
 * 只认**目录里的真名**：名字对不上就返回 null，让校验以
 * 'unknown_item' 拒绝——不能因为"名字里出现了木头两个字"就当持有木头。
 */
function itemIdOf(name) {
  if (typeof name !== 'string' || name === '') return null;
  try {
    const hit = item.query().find((i) => i.name === name || i.id === name);
    return hit === undefined ? null : hit.id;
  } catch {
    return null;
  }
}

/**
 * 采集世界视图：把参与者相关的**真实**世界状态读成一个普通对象。
 * 只读参与者自身 + 全局资源，不做全量扫描（长跑下每次互动都全量读会拖慢主循环）。
 *
 * @param {{ participants?: string[] }} [input]
 * @returns {object} 世界视图
 */
export function collect(input = {}) {
  const participants = Array.isArray(input.participants) ? input.participants.filter((p) => typeof p === 'string') : [];
  const agents = {};
  for (const id of participants) {
    const rec = registry.lookup(id);
    let needs = null;
    try { needs = meter.query({ agentId: id }).needs ?? null; } catch { needs = null; }
    let sick = null;
    try {
      const st = disease.status({ agentId: id });
      sick = st === null || st === undefined ? null : st.infected === true;
    } catch { sick = null; }
    let inventory = {};
    try {
      const bag = backpack.list({ agentId: id });
      inventory = Object.fromEntries(Object.entries(bag.items ?? {}).map(([k, v]) => [k, Number(v) || 0]));
    } catch { inventory = {}; }
    let career = null;
    try { career = role.current(id)?.occupation ?? null; } catch { career = null; }
    agents[id] = {
      agentId: id,
      registered: rec !== null && rec !== undefined,
      alive: rec === null || rec === undefined ? null : (rec.data ?? {}).alive !== false,
      needs,
      sick,
      inventory,
      career,
    };
  }
  let holders = [];
  try { holders = society.active().map((h) => h.agentId); } catch { holders = []; }
  let scheduled = {};
  for (const id of participants) {
    try { scheduled[id] = schedule.current(id)?.occupation ?? null; } catch { scheduled[id] = null; }
  }
  let shelter = null;
  try { shelter = worldState.get('shelter') ?? null; } catch { shelter = null; }
  return { participants, agents, societyHolders: holders, scheduled, shelter };
}

/**
 * 事实目录：每条 { key, description, read(world, subject), parse(text) }。
 *
 * read 返回**世界里的真实值**；verify 用它与声明值比较。
 * patterns/parse 供 fromText 从自由文本抽取（可选渲染入口），
 * 抽出来的值**仍要过 verify**，文本本身不构成凭证。
 */
const CATALOG = [
  {
    key: 'inventory.count',
    description: '某主体背包中某物品的持有数量',
    read: (world, subject, value) => {
      const a = world.agents?.[subject];
      if (a === undefined) return { known: false, reason: 'subject_unknown' };
      const want = value ?? {};
      const id = itemIdOf(want.item);
      if (id === null) return { known: false, reason: 'unknown_item' };
      return { known: true, asserted: a.inventory[id] ?? 0 };
    },
    compare: (asserted, claimed) => {
      const n = Number(claimed?.count);
      if (!Number.isFinite(n) || n < 0) return { ok: false, reason: 'malformed_count' };
      return asserted >= n ? { ok: true } : { ok: false, reason: 'count_not_held' };
    },
    patterns: [/(?:有|持有|带了?)\s*(\d+)\s*(?:份|个|块|本)?\s*(木头|食物|水|斧头|书)/],
    parse: (m) => ({ count: Number(m[1]), item: m[2] }),
  },
  {
    key: 'needs.need',
    description: '某主体的当前需求水平（饥饿/口渴等，0..1）',
    read: (world, subject, value) => {
      const a = world.agents?.[subject];
      if (a === undefined || a.needs === null) return { known: false, reason: 'needs_unavailable' };
      const need = value?.need;
      if (typeof need !== 'string' || !(need in a.needs)) return { known: false, reason: 'unknown_need' };
      return { known: true, asserted: a.needs[need] };
    },
    compare: (asserted, claimed) => {
      const n = Number(claimed?.level);
      if (!Number.isFinite(n)) return { ok: false, reason: 'malformed_level' };
      // 声明与真实值相差 0.25 以内视为同一事实（避免把数值噪声当成撒谎）。
      return Math.abs(asserted - n) <= 0.25 ? { ok: true } : { ok: false, reason: 'level_mismatch' };
    },
    patterns: [/(?:我|他|她)?\s*(?:饿|渴)(?:得)?(?:很|厉害)?/],
    parse: () => ({ need: 'food', level: 1 }),
  },
  {
    key: 'health.sick',
    description: '某主体当前是否患病',
    read: (world, subject) => {
      const a = world.agents?.[subject];
      if (a === undefined || a.sick === null) return { known: false, reason: 'health_unavailable' };
      return { known: true, asserted: a.sick };
    },
    compare: (asserted, claimed) => (Boolean(claimed) === asserted ? { ok: true } : { ok: false, reason: 'health_mismatch' }),
    patterns: [/(?:我|他|她)?\s*(?:生病|病了|感染)/],
    parse: () => true,
  },
  {
    key: 'role.career',
    description: '某主体的职业',
    read: (world, subject) => {
      const a = world.agents?.[subject];
      if (a === undefined) return { known: false, reason: 'subject_unknown' };
      return { known: true, asserted: a.career };
    },
    compare: (asserted, claimed) => (asserted === claimed ? { ok: true } : { ok: false, reason: 'career_mismatch' }),
    patterns: [],
    parse: undefined,
  },
  {
    key: 'role.society',
    description: '某主体是否担任某公共角色',
    read: (world, subject, value) => {
      const want = typeof value === 'string' ? value : value?.role;
      if (typeof want !== 'string' || want === '') return { known: false, reason: 'unknown_role' };
      // 「某人是不是医生」是当前世界的真值；持有人列表由 role.society 聚合给出。
      const holders = Array.isArray(world.societyHolders) ? world.societyHolders : [];
      if (!Array.isArray(world.societyHolders)) return { known: false, reason: 'society_unavailable' };
      return { known: true, asserted: holders.includes(subject) };
    },
    compare: (asserted) => (asserted ? { ok: true } : { ok: false, reason: 'not_a_holder' }),
    patterns: [],
    parse: undefined,
  },
  {
    key: 'world.shelter',
    description: '避难所容量是否达到声明值',
    read: (world) => {
      if (world.shelter === null || world.shelter === undefined) return { known: false, reason: 'shelter_unavailable' };
      return { known: true, asserted: world.shelter };
    },
    compare: (asserted, claimed) => {
      const n = Number(claimed?.capacity);
      if (!Number.isFinite(n)) return { ok: false, reason: 'malformed_capacity' };
      const real = typeof asserted?.capacity === 'number' ? asserted.capacity : null;
      if (real === null) return { ok: false, reason: 'capacity_unavailable' };
      return real >= n ? { ok: true } : { ok: false, reason: 'capacity_mismatch' };
    },
    patterns: [],
    parse: undefined,
  },
];

/** 目录快照（供 fromText 遍历；返回浅拷贝，调用方不能改写目录）。 */
export function catalog() {
  return CATALOG.map((s) => ({ key: s.key, description: s.description, patterns: s.patterns, parse: s.parse }));
}

/** 全部已注册的事实 key。 */
export function keys() {
  return CATALOG.map((s) => s.key);
}

/**
 * 校验一条声明。**纯函数**：同样的 (world, claim) 必得同样结论。
 *
 * @param {{ key: string, value: unknown, claimant?: string }} input
 * @param {object} [world] 世界视图（缺省则当场采集）
 * @returns {{ verified: boolean, key: string, reason: string|null, asserted: unknown }}
 */
export function verify(input = {}, world = null) {
  const key = input.key;
  if (typeof key !== 'string' || key === '') {
    return { verified: false, key: String(key), reason: 'missing_fact_key', asserted: null };
  }
  const spec = CATALOG.find((s) => s.key === key);
  if (spec === undefined) {
    // 目录外一律未证实：宁可少认，不可多认。
    return { verified: false, key, reason: 'unknown_fact_key', asserted: null };
  }
  const subject = input.subject ?? input.claimant ?? null;
  if (typeof subject !== 'string' || subject === '') {
    return { verified: false, key, reason: 'missing_subject', asserted: null };
  }
  const w = world ?? collect({ participants: [subject] });
  const read = spec.read(w, subject, input.value);
  if (!read.known) return { verified: false, key, reason: read.reason, asserted: null };
  const cmp = spec.compare(read.asserted, input.value);
  return {
    verified: cmp.ok === true,
    key,
    reason: cmp.ok === true ? null : cmp.reason,
    asserted: read.asserted,
  };
}

/** 复位（无自有状态；由上层 graph/registry 复位覆盖）。 */
export function __reset() { /* 无自有状态 */ }
