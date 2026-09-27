/**
 * truman-town.runtime.persistence — 完整运行存档 / Full Run Persistence
 *
 * 在 infra.store.archive 的版本化信封之上，把**整个运行**存下来、再原样恢复：
 * 既含图存储里的世界（居民/账户/建筑/关系/日志），也含只活在模块级变量里的
 * 进程状态（时钟、RNG 流位置、ID 计数器、注册表、世界快照、配对/生育索引、
 * 在研项目、价格表、重试队列……，见 runtime.state 的清单）。
 *
 * 职责边界：
 *   - archive（infra）：纯信封——版本、records、sections、回滚。不知道谁是 runtime。
 *   - state（runtime）：状态清单——谁该入档、按什么顺序恢复。
 *   - persistence（本模块）：把两者接起来，对外只暴露「存一次运行 / 恢复一次运行」。
 *
 * **为什么必须有这一层**：只存 graph 的存档能恢复「世界」，但恢复不了「进程」。
 * 续跑时时钟从 0 重来、RNG 从头重放、配对与生育清空——世界看着对，行为全分叉。
 * 本模块的存在就是为了让「存档 → 新进程恢复 → 继续跑」与「一口气跑到底」等价。
 *
 * 不在本模块范围内（后续任务）：自动保存调度、落盘原子替换、多档轮换。
 * 本模块只保证：给定一份快照对象，恢复后能继续跑且结果等价。
 */

import * as archive from '../infra/store/archive.js';
import * as graph from '../infra/store/graph.js';
import * as state from './state.js';

/** 存档中记录的快照格式版本（与 archive.SCHEMA_VERSION 同步演进）。 */
export const RUN_SCHEMA_VERSION = archive.SCHEMA_VERSION;

/**
 * 采集一次完整运行存档。
 * @param {{now?: number, meta?: object, extra?: object}} [input]
 * @returns {object} 可 JSON 序列化的自包含存档
 */
export function saveRun(input = {}) {
  const captured = state.capture();
  return archive.save({
    graph,
    sections: captured.sections,
    meta: {
      ...(input.meta ?? {}),
      // 采集到的 section 清单随档保存：恢复时即使代码新增了 section，
      // 也能看出这份档「当时装了什么」。
      capturedSections: captured.captured,
      ...(captured.skipped.length > 0 ? { skippedSections: captured.skipped } : {}),
    },
    extra: input.extra,
    now: input.now,
  });
}

/**
 * 从完整存档恢复一次运行。
 *
 * 恢复顺序由 archive.load 保证：先清空并写回 graph（records），
 * 再按 runtime.state 的清单顺序还原各 section（graph → semantic → 其余）。
 * 该顺序不可交换：semantic 要把 lastGeneration 对齐到 graph 的新代数。
 * @param {object} snapshot
 * @returns {{loaded: number, sections: object|null, migratedFrom: number|null, validation: object}}
 */
export function restoreRun(snapshot) {
  const sections = (snapshot && typeof snapshot === 'object' && snapshot.sections && typeof snapshot.sections === 'object')
    ? snapshot.sections
    : {};
  const validation = state.validate(sections);
  const res = archive.load(snapshot, {
    graph,
    __reset: graph.__reset,
    restoreSections: (secs) => state.restore(secs),
  });
  return { ...res, validation };
}

/** 状态清单（谁入了档、什么性质），供 API 与文档展示。 */
export function inventory() {
  return state.inventory();
}

/**
 * 校验一份存档是否为**完整运行存档**（覆盖全部 core section）。
 * @param {object} snapshot
 */
export function validate(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object') {
    return { ok: false, reason: '存档必须为对象', missing: [], extra: [], schemaVersion: null };
  }
  const version = snapshot.schemaVersion;
  const sections = (snapshot.sections && typeof snapshot.sections === 'object') ? snapshot.sections : {};
  const v = state.validate(sections);
  const versionOk = archive.SUPPORTED_VERSIONS.includes(version);
  return {
    ok: versionOk && v.ok,
    reason: versionOk ? (v.ok ? null : '缺少 core section') : '存档版本不兼容',
    schemaVersion: version,
    missing: v.missing,
    extra: v.extra,
  };
}

/** 存档摘要。 */
export function describe(snapshot) {
  return archive.describe(snapshot ?? {});
}
