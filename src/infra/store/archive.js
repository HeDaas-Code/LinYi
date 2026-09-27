/**
 * truman-town.infra.store.archive — 存档存储。
 *
 * 把沙盘状态序列化为一个自包含、可版本迁移的存档对象，并支持还原。
 *
 * 设计取舍：
 * - **快照即数据，不依赖文件系统**：save 返回纯 JSON 可序列化对象，load 接收它。
 *   持久化到磁盘/对象存储是调用方的选择（api.archive 负责落盘），
 *   这样本模块在浏览器与服务端都能用，也便于测试。
 * - **版本号显式**：存档带 schemaVersion，load 时校验，避免旧档静默错读。
 * - **还原是破坏性的且可回滚**：load 先快照当前状态，若写入中途失败则还原，
 *   避免把沙盘留在「一半新一半旧」的损坏态。
 *
 * v1 → v2 的演进（t3 完整运行存档）：
 *   v1 只装 graph 的节点记录。但**世界不等于运行**——时钟、RNG 流位置、ID 计数器、
 *   实体注册表、世界快照、配对/生育索引、在研项目、价格表、重试队列都只活在模块
 *   级变量里。只还原 graph 会得到一个「世界对、进程错」的沙盘：同一批居民，
 *   却从 tick 0 重新计时、随机序列从头重放。
 *   v2 在 records 之外增加 `sections`（由 runtime.state 采集/恢复的命名状态块）。
 *   v1 档仍可加载（sections 缺失 → 仅还原图，并在结果里标注 migratedFrom）。
 */

/** 当前存档版本。v2 = graph records + runtime sections。 */
export const SCHEMA_VERSION = 2;

/** 本模块可加载的历史版本（用于迁移判定）。 */
export const SUPPORTED_VERSIONS = Object.freeze([1, 2]);

/**
 * 采集全量存档快照。
 * @param {{graph?: {read: Function}, sections?: object, extra?: object, meta?: object, now?: number}} input
 */
export function save(input = {}) {
  const graphApi = input.graph;
  let records = [];
  if (graphApi && typeof graphApi.read === 'function') {
    const r = graphApi.read({});
    records = Array.isArray(r) ? r : [];
  }
  const sections = (input.sections && typeof input.sections === 'object' && !Array.isArray(input.sections))
    ? structuredClone(input.sections)
    : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: typeof input.now === 'number' ? input.now : null,
    meta: input.meta && typeof input.meta === 'object' ? { ...input.meta } : {},
    extra: input.extra && typeof input.extra === 'object' ? { ...input.extra } : {},
    records,
    sections,
    counts: {
      records: records.length,
      sections: Object.keys(sections).length,
    },
  };
}

/**
 * 从存档还原。写入失败时回滚到调用前状态。
 *
 * 顺序（不可交换）：先清空图、写回 records，再交由 `restoreSections` 还原各命名状态块。
 * 图必须最先还原——其余模块的派生索引按图的代数失效重建；
 * sections 的还原顺序由调用方（runtime.state）保证。
 * @param {object} snapshot
 * @param {{graph?: {write: Function, read: Function}, __reset?: Function,
 *          restoreSections?: (sections: object) => object}} target
 */
export function load(snapshot, target = {}) {
  if (snapshot === null || typeof snapshot !== 'object') {
    throw new TypeError('archive.load: 存档必须为对象');
  }
  if (!SUPPORTED_VERSIONS.includes(snapshot.schemaVersion)) {
    throw new Error('archive.load: 存档版本不兼容（支持 ' + SUPPORTED_VERSIONS.join('/') + '，收到 ' + snapshot.schemaVersion + '）');
  }
  const records = Array.isArray(snapshot.records) ? snapshot.records : [];
  const graphApi = target.graph;
  if (!graphApi || typeof graphApi.write !== 'function') {
    throw new TypeError('archive.load: 需要 target.graph.write');
  }
  const backup = typeof graphApi.read === 'function' ? graphApi.read({}) : null;
  if (typeof target.__reset === 'function') target.__reset();
  let written = 0;
  try {
    for (const rec of records) { graphApi.write(rec); written += 1; }
  } catch (err) {
    // 回滚：清空后写回备份，避免半新半旧的损坏态。
    if (typeof target.__reset === 'function') target.__reset();
    if (Array.isArray(backup)) for (const rec of backup) { try { graphApi.write(rec); } catch { /* 回滚尽力而为 */ } }
    throw new Error('archive.load: 写入失败已回滚（已写 ' + written + '/' + records.length + '）：' + err.message);
  }
  // 图已就绪，再还原命名状态块（v1 档没有 sections，跳过）。
  let sectionResult = null;
  const sections = (snapshot.sections && typeof snapshot.sections === 'object') ? snapshot.sections : null;
  if (sections !== null && typeof target.restoreSections === 'function') {
    sectionResult = target.restoreSections(sections);
  }
  return {
    loaded: written,
    meta: snapshot.meta ?? {},
    extra: snapshot.extra ?? {},
    sections: sectionResult,
    // v1 档在 v2 代码下加载时标注来源版本，让调用方知道它只含图状态。
    migratedFrom: snapshot.schemaVersion === SCHEMA_VERSION ? null : snapshot.schemaVersion,
  };
}

/** 存档摘要（不解完整数据即可看到规模与来源）。 */
export function describe(snapshot = {}) {
  return {
    schemaVersion: snapshot.schemaVersion ?? null,
    savedAt: snapshot.savedAt ?? null,
    records: Array.isArray(snapshot.records) ? snapshot.records.length : 0,
    sections: (snapshot.sections && typeof snapshot.sections === 'object') ? Object.keys(snapshot.sections) : [],
    meta: snapshot.meta ?? {},
  };
}
