/**
 * truman-town.infra.store.hot-log — 热数据上限、载荷分级与归档
 *
 * ## 问题
 * 长跑下追加型日志无界增长。实测 12 居民 100 tick：图节点 3275 → 18977，
 * 其中 memory.episodic 7125、observer.event 3235、observer.action 1859、
 * observer.decision 1770。每次 read({type}) 都要遍历全部节点。
 *
 * ## 两条**不可混淆**的策略
 * 「日志」有两种完全不同的性质，混为一谈会毁掉审计：
 *
 * 1. **审计日志**（决策/行为/事件）—— 记录的是「发生过什么」。
 *    它们**不能**被裁剪掉，否则历史被静默截断：50×200 的运行产生上万条决策，
 *    若只保留最近 1500 条，审计就从「可回溯全部决策」退化成「只能看到尾巴」，
 *    而调用方拿到一个变短的数组却无从察觉。
 *    这类日志用 **compact 模式**：**一条都不删**，只把超出热区的旧记录
 *    **原地压缩**成摘要（保留 tick/seq/agentId/决策或动作/理由/关联 id，
 *    丢弃 options/context/intent/model/schedule/final/payload 等冗长载荷）。
 *    于是 list() 仍是全量，条数不变，引用不悬空，而内存占用回到有界。
 *
 * 2. **工作集**（帖子等）—— 只有最近的部分会被再次访问，
 *    很早的记录本就无人读取。这类用 **evict 模式**：真正移除并归档摘要。
 *
 * 两者都保证 **引用不悬空**：lookup() 永远能区分
 *   found（full / compact 两种详略）/ evicted（确实被移除过）/ unknown（从未存在）。
 *
 * ## 为什么压缩用 graph.patch 而不是 graph.write
 * write() 对已存在的 id 会先摘除再重新加入 byType 索引，节点因此被移到末尾，
 * 追加顺序（= 审计顺序）被打乱。patch() 原地换 data，保留位置。
 */

import * as graph from './graph.js';

/**
 * 审计日志的默认热上限：**Infinity = 不压缩**。
 *
 * 为什么不默认压缩：决策/行为/事件记录里的每一个字段都有消费者——
 * options / context / intent / model / schedule / final（决策）与 outcome（行为）
 * 分别被审计、编年与多条行为契约测试读取。任何「丢字段换内存」的压缩都会让
 * 这些读取静默拿到 undefined，把「历史被压缩」伪装成「这件事没发生过」。
 *
 * 因此默认行为是**保真**：list()/all() 全量、字段完整。需要为超长跑控制内存时，
 * 由调用方显式配置上限（createLog({ hotLimit: N }) 或 configureRetention），
 * 并接受「超出热区的旧记录只保留审计骨架」这一被明确文档化的取舍。
 */
const DEFAULT_HOT_LIMIT = Infinity;
/** 工作集默认保留条数。 */
const DEFAULT_EVICT_LIMIT = 300;
/** 归档摘要上限（仅 evict 模式使用）。 */
const DEFAULT_ARCHIVE_LIMIT = 4000;

/** @type {Map<string, object>} 名称 → 日志状态。 */
const logs = new Map();

function assertName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('hot-log: name 必须为非空字符串');
  }
}

function intOr(value, dflt) {
  if (value === Infinity) return Infinity;
  return Number.isInteger(value) && value >= 0 ? value : dflt;
}

/** 从 [prefix].[seq] 形式的 id 中取出 seq；解析不出返回 null。 */
function defaultSeqOf(id) {
  if (typeof id !== 'string') return null;
  const i = id.lastIndexOf('.');
  if (i < 0) return null;
  const n = Number(id.slice(i + 1));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** 压缩标记：带此字段的节点表示「只保留摘要」。 */
export const COMPACTED_FLAG = '__compacted';

/**
 * 结构保持的深度裁剪。
 *
 * 实测各日志的载荷分布：decision 的 context(51%)+options(24%)、
 * action 的 outcome(77%)、event 的 payload(60%) —— 占字节的绝大部分，
 * 而它们恰恰是审计要读的字段。因此「丢字段」的压缩方式必然损伤审计。
 *
 * 本函数改为**保结构、压长度**：对象键全部保留（嵌套结构仍可按路径访问），
 * 只把过长的字符串截断、过长的数组截短。这样
 *   context.contention.doomedButChosen 之类的判定字段仍然可读，
 * 而内嵌的大段文本/列表不再撑爆内存。
 * @param {unknown} value
 * @param {{maxString?: number, maxArray?: number, maxDepth?: number}} [opts]
 */
export function capDeep(value, opts = {}) {
  const maxString = intOr(opts.maxString, 160);
  const maxArray = intOr(opts.maxArray, 12);
  const maxDepth = intOr(opts.maxDepth, 4);

  function walk(v, depth) {
    if (typeof v === 'string') {
      return v.length > maxString ? v.slice(0, maxString) + '…' : v;
    }
    if (v === null || typeof v !== 'object') return v;
    if (depth >= maxDepth) {
      // 超深结构整体折叠，但保持可读（不是 undefined）。
      if (Array.isArray(v)) return { __truncated: 'array', length: v.length };
      return { __truncated: 'object', keys: Object.keys(v).slice(0, 12) };
    }
    if (Array.isArray(v)) {
      const head = v.slice(0, maxArray).map((x) => walk(x, depth + 1));
      return head;
    }
    const out = {};
    for (const k of Object.keys(v)) out[k] = walk(v[k], depth + 1);
    return out;
  }
  return walk(value, 0);
}

/** 节点是否已被压缩为摘要。 */
export function isCompacted(node) {
  return node !== null && node !== undefined && node.data !== null
    && typeof node.data === 'object' && node.data[COMPACTED_FLAG] === true;
}

function bump(map, key) {
  if (key === undefined || key === null || key === '') return;
  map.set(String(key), (map.get(String(key)) ?? 0) + 1);
}

/**
 * 创建（或取回）一个受上限约束的日志。幂等：同名重复调用返回同一实例。
 * @param {string} name
 * @param {{ type: string, mode?: 'compact'|'evict', hotLimit?: number,
 *          archiveLimit?: number, summarize?: (data: object) => object,
 *          seqOf?: (id: string) => number|null }} options
 */
export function createLog(name, options = {}) {
  assertName(name);
  const type = options.type;
  if (typeof type !== 'string' || type.trim() === '') {
    throw new TypeError('hot-log.createLog: type 必须为非空字符串');
  }
  const mode = options.mode === 'evict' ? 'evict' : 'compact';
  let state = logs.get(name);
  if (state === undefined) {
    state = {
      name, type, mode,
      hotLimit: intOr(options.hotLimit, mode === 'evict' ? DEFAULT_EVICT_LIMIT : DEFAULT_HOT_LIMIT),
      archiveLimit: intOr(options.archiveLimit, DEFAULT_ARCHIVE_LIMIT),
      summarize: typeof options.summarize === 'function' ? options.summarize : null,
      seqOf: typeof options.seqOf === 'function' ? options.seqOf : defaultSeqOf,
      /** @type {Map<string, object>} 仅 evict 模式：被移除记录的摘要。 */
      archive: new Map(),
      evicted: 0,
      dropped: 0,
      compacted: 0,
      maxSeq: -1,
      /**
       * 未压缩（载荷完整）节点数——增量维护，避免每次写入都全图清点。
       * null 表示尚未初始化，下一次写入时惰性重建。
       */
      fullCount: null,
      /** 压缩游标：本类型 id 列表中「下一个待检查位置」，压缩只向前推进。 */
      cursor: 0,
      /** 游标对应的 graph 代数；图被整体替换后必须重置。 */
      cursorGen: -1,
      byTopic: new Map(),
      byAgent: new Map(),
      tickRange: { first: null, last: null },
    };
    logs.set(name, state);
  } else {
    if (options.hotLimit !== undefined) state.hotLimit = intOr(options.hotLimit, state.hotLimit);
    if (options.archiveLimit !== undefined) state.archiveLimit = intOr(options.archiveLimit, state.archiveLimit);
    if (typeof options.summarize === 'function') state.summarize = options.summarize;
    if (typeof options.seqOf === 'function') state.seqOf = options.seqOf;
  }
  return apiFor(state);
}

/**
 * 折叠成摘要：默认只保留审计骨架，丢弃冗长载荷。
 * 各日志可传入自己的 summarize 以精确控制「什么必须留下」。
 */
function summarizeData(state, data) {
  let out;
  if (state.summarize !== null) {
    out = state.summarize(data);
  } else {
    out = {};
    for (const k of ['tick', 'seq', 'ts', 'agentId', 'topic', 'action', 'decision', 'reason', 'decisionId']) {
      if (data !== null && typeof data === 'object' && data[k] !== undefined) out[k] = data[k];
    }
  }
  // 标记由本模块统一补上：自定义 summarize 忘记加标记会让 isCompacted 判定失效，
  // 压缩过的节点会被当成热区完整记录，热区计数随之虚高。
  return { ...out, [COMPACTED_FLAG]: true };
}

function noteTick(state, data) {
  if (data === null || data === undefined || !Number.isInteger(data.tick)) return;
  if (state.tickRange.first === null || data.tick < state.tickRange.first) state.tickRange.first = data.tick;
  if (state.tickRange.last === null || data.tick > state.tickRange.last) state.tickRange.last = data.tick;
}

/**
 * 批量压缩的粒度：一次压缩到 hotLimit 之下这么多条，之后若干次写入都不必再清点。
 *
 * 不这么做的话，每次写入都要重新扫描全类型节点（即使只多出 1 条），
 * 长跑下退化成 O(n²)：实测 8000 条 × 上万次写入直接把测试跑过 280s 超时。
 */
function batchSize(hotLimit) {
  return Math.max(32, Math.min(512, Math.ceil(hotLimit / 4)));
}

/** 图被整体替换（存档恢复）后，增量计数与游标必须失效重建。 */
function syncGeneration(state) {
  const gen = graph.__generation();
  if (gen !== state.cursorGen) {
    state.cursorGen = gen;
    state.cursor = 0;
    state.fullCount = null;
  }
}

/** 惰性重建「未压缩节点数」（仅在代数变化后做一次，O(n) 且不克隆）。 */
function countFull(state) {
  if (state.fullCount !== null) return state.fullCount;
  let n = 0;
  for (const id of graph.ids({ type: state.type })) {
    if (!isCompacted(graph.peek(id))) n += 1;
  }
  state.fullCount = n;
  return n;
}

/**
 * compact 模式：把最旧的超额记录原地压缩（**不删任何记录**）。
 * 用游标 + 批量摊还，稳态下每次写入的均摊成本接近 O(1)。
 */
function enforceCompact(state) {
  // Infinity = 保真模式，不做任何压缩（默认）。
  if (state.hotLimit === Infinity) return 0;
  syncGeneration(state);
  const full = countFull(state);
  if (full <= state.hotLimit) return 0;
  const target = Math.max(0, state.hotLimit - batchSize(state.hotLimit));
  const allIds = graph.ids({ type: state.type });
  let compacted = 0;
  let i = state.cursor;
  while (i < allIds.length && state.fullCount > target) {
    const node = graph.peek(allIds[i]);
    if (node === null) { i += 1; continue; }
    if (!isCompacted(node)) {
      graph.patch(allIds[i], summarizeData(state, node.data));
      state.compacted += 1;
      state.fullCount -= 1;
      compacted += 1;
    }
    i += 1;
  }
  state.cursor = i;
  return compacted;
}

/** evict 模式：把最旧的超额记录移除并归档摘要。 */
function enforceEvict(state) {
  const over = graph.count({ type: state.type }) - state.hotLimit;
  if (over <= 0) return 0;
  const removed = graph.trimOldest({ type: state.type, keep: state.hotLimit });
  for (const node of removed) pushArchive(state, node.id, node.data);
  return removed.length;
}

/** 把一条记录压入归档（仅 evict 模式），并维护有界聚合。 */
function pushArchive(state, id, data) {
  const summary = { id, ...summarizeData(state, data ?? {}) };
  state.archive.set(id, summary);
  bump(state.byTopic, summary.topic);
  bump(state.byAgent, summary.agentId);
  noteTick(state, summary);
  while (state.archive.size > state.archiveLimit) {
    const oldest = state.archive.keys().next().value;
    state.archive.delete(oldest);
    state.dropped += 1;
  }
}

function apiFor(state) {
  return {
    name: state.name,
    type: state.type,
    mode: state.mode,

    /** 记录一条新节点的 id（append 之后调用，维护上限与序号水位）。 */
    note(id, data) {
      const seq = state.seqOf(id);
      if (seq !== null && seq > state.maxSeq) state.maxSeq = seq;
      noteTick(state, data);
      if (state.mode === 'evict') return enforceEvict(state);
      syncGeneration(state);
      // 新写入的节点必然是未压缩的；已初始化时直接增量 +1，避免全图清点。
      if (state.fullCount !== null) state.fullCount += 1;
      return enforceCompact(state);
    },

    /**
     * 直接把一条**已从图中移除**的记录压入归档（仅 evict 模式）。
     * 调用方若自行维护内存索引并先删了图节点，必须走这里——
     * 再调 note() 的话图已在上限内，待归档的节点再也看不到。
     */
    archive(id, data) {
      const seq = state.seqOf(id);
      if (seq !== null && seq > state.maxSeq) state.maxSeq = seq;
      pushArchive(state, id, data ?? {});
      state.evicted += 1;
      return true;
    },

    /** 全部记录（含压缩摘要）——**审计历史的完整视图**。 */
    all() {
      return graph.read({ type: state.type });
    },

    /** 仅热区（载荷完整）的记录。 */
    hot() {
      return graph.read({ type: state.type }).filter((n) => !isCompacted(n));
    },

    /** 已被压缩成摘要的记录。 */
    compacted() {
      return graph.read({ type: state.type }).filter((n) => isCompacted(n));
    },

    /** 归档摘要（仅 evict 模式）。 */
    archived() {
      return [...state.archive.values()];
    },

    /**
     * 最近 N 条（最新在前），默认取**全部**记录而非仅热区——
     * 与 list() 的「历史完整」契约保持一致。
     */
    recent(options = {}) {
      let list = graph.read({ type: state.type });
      if (options.hotOnly === true) list = list.filter((n) => !isCompacted(n));
      if (typeof options.agentId === 'string') list = list.filter((n) => n.data?.agentId === options.agentId);
      if (typeof options.topic === 'string') list = list.filter((n) => n.data?.topic === options.topic);
      if (Number.isInteger(options.since)) {
        list = list.filter((n) => Number.isInteger(n.data?.tick) && n.data.tick >= options.since);
      }
      const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : 50;
      return list.slice(-limit).reverse();
    },

    /**
     * 解析一个引用 id。
     * @returns {{found: boolean, source: 'hot'|'compact'|'archive'|'evicted'|'unknown',
     *            verbosity?: 'full'|'summary', id: string, record?: object, seq?: number|null}}
     */
    lookup(id) {
      const node = graph.read(id);
      if (node !== null && node !== undefined) {
        const compact = isCompacted(node);
        return {
          found: true,
          source: compact ? 'compact' : 'hot',
          verbosity: compact ? 'summary' : 'full',
          id, record: node.data, seq: state.seqOf(id),
        };
      }
      if (state.archive.has(id)) {
        return { found: true, source: 'archive', verbosity: 'summary', id, record: state.archive.get(id), seq: state.seqOf(id) };
      }
      const seq = state.seqOf(id);
      // 区间判定：seq 单调递增，seq <= maxSeq 的 id 一定签发过。
      // 「已淘汰」与「从未存在」必须区分，否则审计结论会静默失真。
      if (seq !== null && seq <= state.maxSeq) {
        return { found: false, source: 'evicted', id, seq };
      }
      return { found: false, source: 'unknown', id, seq };
    },

    /** 有界统计。total 恒等于图中该类型的节点数（审计不丢记录）。 */
    stats() {
      const total = graph.count({ type: state.type });
      // 用 peek 计数：stats() 会被观测 API 周期性调用，深拷贝全量节点代价过高。
      let compacted = 0;
      for (const id of graph.ids({ type: state.type })) if (isCompacted(graph.peek(id))) compacted += 1;
      return {
        name: state.name,
        type: state.type,
        mode: state.mode,
        total,
        hot: total - compacted,
        compacted,
        // Infinity 无法 JSON 序列化，对外暴露为 null（含义：不设上限/不压缩）。
        hotLimit: state.hotLimit === Infinity ? null : state.hotLimit,
        unbounded: state.hotLimit === Infinity,
        archive: state.archive.size,
        archiveLimit: state.archiveLimit,
        evicted: state.evicted,
        dropped: state.dropped,
        maxSeq: state.maxSeq,
        tickRange: { ...state.tickRange },
        byTopic: Object.fromEntries(state.byTopic),
        byAgent: Object.fromEntries(state.byAgent),
      };
    },

    __reset() {
      state.archive.clear();
      state.evicted = 0;
      state.dropped = 0;
      state.compacted = 0;
      state.maxSeq = -1;
      state.fullCount = null;
      state.cursor = 0;
      state.cursorGen = -1;
      state.byTopic.clear();
      state.byAgent.clear();
      state.tickRange = { first: null, last: null };
    },
  };
}

/**
 * 显式配置某条日志的热上限（开启载荷分级）。
 *
 * 默认是保真（不压缩）。调用本函数即表示**接受**「超出上限的旧记录只保留
 * 审计骨架」这一取舍：记录条数不变、id 与引用不变，但旧记录会丢失
 * options/context/intent/model/schedule/final（决策）或 outcome（行为）等载荷字段。
 * @param {string} name
 * @param {{ hotLimit: number }} options
 */
export function configureRetention(name, options = {}) {
  const state = logs.get(name);
  if (state === undefined) {
    throw new TypeError('hot-log.configureRetention: 未注册的日志 ' + String(name));
  }
  if (options.hotLimit !== Infinity && (!Number.isInteger(options.hotLimit) || options.hotLimit < 0)) {
    throw new TypeError('hot-log.configureRetention: hotLimit 必须为非负整数或 Infinity');
  }
  state.hotLimit = options.hotLimit;
  state.fullCount = null;
  state.cursor = 0;
  state.cursorGen = -1;
  return apiFor(state).stats();
}

/** 全部已注册日志的名称。 */
export function logNames() {
  return [...logs.keys()];
}

/** 全部日志的统计。 */
export function stats() {
  const out = {};
  for (const [name, state] of logs) out[name] = apiFor(state).stats();
  return out;
}

// ---- 持久化 ----
//
// compact 模式**不需要**额外入档：压缩是原地改写图节点，随 graph.__snapshot 一起
// 保存与恢复，恢复后 isCompacted 判定与 total/hot 计数自动正确。
// evict 模式的归档与计数只在内存，必须入档，否则恢复后「已淘汰」会退化成「从未存在」。

/** 导出 evict 归档与全部计数器。 */
export function __snapshot() {
  const out = {};
  for (const [name, state] of logs) {
    out[name] = {
      archive: [...state.archive.entries()],
      evicted: state.evicted,
      dropped: state.dropped,
      compacted: state.compacted,
      maxSeq: state.maxSeq,
      byTopic: [...state.byTopic.entries()],
      byAgent: [...state.byAgent.entries()],
      tickRange: { ...state.tickRange },
      hotLimit: state.hotLimit,
      archiveLimit: state.archiveLimit,
    };
  }
  return { logs: out };
}

/**
 * 恢复 evict 归档与计数器（整体替换）。必须在 graph.__restore 之后调用。
 * @param {{logs?: object}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('hot-log.__restore: 状态必须为对象');
  }
  const src = (data.logs && typeof data.logs === 'object') ? data.logs : {};
  let restored = 0;
  for (const [name, state] of logs) {
    const d = src[name];
    if (d === undefined || d === null || typeof d !== 'object') continue;
    state.archive.clear();
    for (const pair of (Array.isArray(d.archive) ? d.archive : [])) {
      if (Array.isArray(pair) && pair.length >= 2 && typeof pair[0] === 'string') {
        state.archive.set(pair[0], pair[1]);
      }
    }
    state.evicted = intOr(d.evicted, 0);
    state.dropped = intOr(d.dropped, 0);
    state.compacted = intOr(d.compacted, 0);
    state.maxSeq = Number.isInteger(d.maxSeq) ? d.maxSeq : -1;
    // 计数与游标随图重建失效（__restore 在 graph.__restore 之后调用，代数已变）。
    state.fullCount = null;
    state.cursor = 0;
    state.cursorGen = -1;
    if (Number.isInteger(d.hotLimit)) state.hotLimit = d.hotLimit;
    if (Number.isInteger(d.archiveLimit)) state.archiveLimit = d.archiveLimit;
    state.byTopic.clear();
    for (const pair of (Array.isArray(d.byTopic) ? d.byTopic : [])) {
      if (Array.isArray(pair) && pair.length >= 2) state.byTopic.set(pair[0], pair[1]);
    }
    state.byAgent.clear();
    for (const pair of (Array.isArray(d.byAgent) ? d.byAgent : [])) {
      if (Array.isArray(pair) && pair.length >= 2) state.byAgent.set(pair[0], pair[1]);
    }
    const tr = d.tickRange;
    state.tickRange = {
      first: (tr && Number.isInteger(tr.first)) ? tr.first : null,
      last: (tr && Number.isInteger(tr.last)) ? tr.last : null,
    };
    restored += 1;
  }
  return { logs: restored };
}

/** 复位全部日志的归档与计数（测试用；不动图）。 */
export function __reset() {
  for (const state of logs.values()) apiFor(state).__reset();
}

