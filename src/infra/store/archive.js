/**
 * truman-town.infra.store.archive — 存档存储。
 *
 * 把「图存储的全部记录」序列化为一个自包含的存档对象，并支持还原。
 *
 * 设计取舍：
 * - **快照即数据，不依赖文件系统**：save 返回纯 JSON 可序列化对象，load 接收它。
 *   持久化到磁盘/对象存储是调用方的选择（api.archive 负责落盘），
 *   这样本模块在浏览器与服务端都能用，也便于测试。
 * - **版本号显式**：存档带 schemaVersion，load 时校验，避免旧档静默错读。
 * - **还原是破坏性的且可回滚**：load 先快照当前状态，若写入中途失败则还原，
 *   避免把沙盘留在「一半新一半旧」的损坏态。
 */

export const SCHEMA_VERSION = 1;

/**
 * 采集全量存档快照。
 * @param {{graph?: {read: Function}, extra?: object, meta?: object}} input
 */
export function save(input = {}) {
  const graphApi = input.graph;
  let records = [];
  if (graphApi && typeof graphApi.read === 'function') {
    const r = graphApi.read({});
    records = Array.isArray(r) ? r : [];
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: typeof input.now === 'number' ? input.now : null,
    meta: input.meta && typeof input.meta === 'object' ? { ...input.meta } : {},
    extra: input.extra && typeof input.extra === 'object' ? { ...input.extra } : {},
    records,
    counts: { records: records.length },
  };
}

/**
 * 从存档还原。写入失败时回滚到调用前状态。
 * @param {object} snapshot
 * @param {{graph?: {write: Function, read: Function}, __reset?: Function}} target
 */
export function load(snapshot, target = {}) {
  if (snapshot === null || typeof snapshot !== 'object') {
    throw new TypeError('archive.load: 存档必须为对象');
  }
  if (snapshot.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('archive.load: 存档版本不兼容（期望 ' + SCHEMA_VERSION + '，收到 ' + snapshot.schemaVersion + '）');
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
  return { loaded: written, meta: snapshot.meta ?? {}, extra: snapshot.extra ?? {} };
}

/** 存档摘要（不解完整数据即可看到规模与来源）。 */
export function describe(snapshot = {}) {
  return {
    schemaVersion: snapshot.schemaVersion ?? null,
    savedAt: snapshot.savedAt ?? null,
    records: Array.isArray(snapshot.records) ? snapshot.records.length : 0,
    meta: snapshot.meta ?? {},
  };
}
