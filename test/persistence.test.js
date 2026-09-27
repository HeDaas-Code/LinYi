/**
 * truman-town 持久化验收测试 / Persistence acceptance tests
 *
 * 覆盖 t3「修复持久化语义并建立完整可恢复运行存档」的验收面：
 *  1. memoryPersist 的**布尔语义**（默认 / true / false 三态各自落图与否）。
 *  2. 存档版本信封 v1/v2 的兼容与迁移标注。
 *  3. validate() 的完整性判定（缺 core section 必须被指出）。
 *  4. 存档 JSON 往返后恢复无损（逐 section 深度比对）。
 *  5. 独立进程恢复后续跑 与 连续运行 等价（跨进程，非同进程重放）。
 *
 * 为什么 5 必须跨进程：同进程里模块级单例（RNG 流位置、ID 计数器、注册表、
 * 各阶段计数器）都还在内存中，即使不恢复存档也能「看起来对」。只有换一个
 * 全新 Node 进程，才能证明存档真的把「运行」而不只是「世界」带了过去。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as loop from '../src/runtime/orchestrator/loop.js';
import * as persistence from '../src/runtime/persistence.js';
import * as state from '../src/runtime/state.js';
import * as archive from '../src/infra/store/archive.js';
import * as graph from '../src/infra/store/graph.js';
import * as posts from '../src/social/platform/posts.js';
import * as contention from '../src/agent/decision/contention.js';
import * as stageProgress from '../src/runtime/orchestrator/stage-progress.js';
import * as configStore from '../src/infra/config.js';
import * as clock from '../src/runtime/clock.js';
import * as registry from '../src/runtime/registry.js';
import * as rng from '../src/infra/rng.js';
import * as meter from '../src/survival/needs/meter.js';
import * as craftJobs from '../src/agent/crafting/workbench/executor.js';

/** 基准配置：固定种子，phase2/phase3 全开（覆盖最宽的状态面）。 */
const BASE = { seed: 7, agentCount: 4, phase2: true, phase3: true };

const SEMANTIC_TYPE = 'memory.semantic';
const semanticNodeCount = () => graph.read({ type: SEMANTIC_TYPE }).length;

// ---- 1. memoryPersist 布尔语义 ----

test('persistence: memoryPersist 默认关闭——高频主循环的语义记忆只写内存', async () => {
  await loop.run({ ...BASE, ticks: 3 });
  assert.equal(semanticNodeCount(), 0, '默认（未显式开启）时语义记忆不应落图');
});

test('persistence: memoryPersist=true 把语义记忆落图', async () => {
  await loop.run({ ...BASE, ticks: 3, memoryPersist: true });
  assert.ok(semanticNodeCount() > 0, 'memoryPersist=true 时语义记忆必须落图，否则开关形同虚设');
});

test('persistence: memoryPersist=false 与默认一致（显式关闭不落图）', async () => {
  await loop.run({ ...BASE, ticks: 3, memoryPersist: false });
  assert.equal(semanticNodeCount(), 0, 'memoryPersist=false 时语义记忆不应落图');
});

test('persistence: memoryPersist 必须是布尔值（配置校验拒绝字符串）', () => {
  // 语义修复的另一半：开关值本身也要被校验守住。
  // 否则 memoryPersist: 'yes' 会被 === true 判成 false（静默不落图），
  // 而 'false' 字符串同样会被判成 true——两种写法都给出与字面相反的结果。
  const ok = configStore.validate({ memoryPersist: true });
  assert.equal(ok.ok, true, '布尔值应通过校验');
  const bad = configStore.validate({ memoryPersist: 'yes' });
  assert.equal(bad.ok, false, '字符串必须被拒绝，不得被真值判断悄悄接受');
  assert.ok(bad.errors.some((e) => e.key === 'memoryPersist'), '错误必须指向 memoryPersist 键');
  assert.equal(configStore.validate({ memoryPersist: false }).ok, true);
});

// ---- 2. 版本信封 ----

test('persistence: 存档带 v2 版本信封、graph records 与 section 清单', async () => {
  await loop.run({ ...BASE, ticks: 2 });
  const snap = persistence.saveRun({ now: 2 });
  assert.equal(snap.schemaVersion, archive.SCHEMA_VERSION);
  assert.ok(Array.isArray(snap.records) && snap.records.length > 0, 'records 必须非空');
  assert.equal(typeof snap.sections, 'object');
  assert.ok(Object.keys(snap.sections).length >= 30, '完整运行存档必须覆盖全部 core section');
  assert.equal(snap.counts.sections, Object.keys(snap.sections).length);
  // 存档必须可 JSON 序列化（否则落盘时静默丢 Map/Set）。
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(snap)));
});

test('persistence: v1 档（仅 graph records）仍可加载并标注迁移来源', async () => {
  graph.__reset();
  const v1 = {
    schemaVersion: 1,
    records: [{ id: 'legacy:1', type: 'legacy.node', data: { a: 1, b: 'x' } }],
    meta: { note: 'v1' },
  };
  const res = archive.load(v1, { graph, __reset: graph.__reset });
  assert.equal(res.migratedFrom, 1, 'v1 档在 v2 代码下加载必须标注来源版本');
  assert.equal(res.loaded, 1);
  assert.equal(res.sections, null, 'v1 档没有 sections，不应伪造');
  const node = graph.read('legacy:1');
  assert.equal(node.data.a, 1, 'v1 档的图节点必须真的写回');
});

test('persistence: v2 档加载时 migratedFrom 为 null（同版本不算迁移）', async () => {
  await loop.run({ ...BASE, ticks: 1 });
  const snap = persistence.saveRun({ now: 1 });
  const res = persistence.restoreRun(snap);
  assert.equal(res.migratedFrom, null);
});

test('persistence: 不支持的存档版本被显式拒绝', async () => {
  assert.throws(
    () => archive.load({ schemaVersion: 99, records: [] }, { graph }),
    /版本不兼容/,
    '未知版本必须抛错，不得静默按当前版本误读',
  );
});

// ---- 3. validate() 完整性 ----

test('persistence: validate 对完整存档判定通过', async () => {
  await loop.run({ ...BASE, ticks: 2 });
  const v = persistence.validate(persistence.saveRun({ now: 2 }));
  assert.equal(v.ok, true);
  assert.equal(v.reason, null);
  assert.deepEqual(v.missing, []);
});

test('persistence: validate 指出缺失的 core section', async () => {
  await loop.run({ ...BASE, ticks: 2 });
  const snap = persistence.saveRun({ now: 2 });
  const broken = { ...snap, sections: { ...snap.sections } };
  delete broken.sections.graph;
  delete broken.sections.rng;
  const v = persistence.validate(broken);
  assert.equal(v.ok, false, '缺 core section 不得判定为完整存档');
  assert.ok(v.missing.includes('graph'), '必须指出缺失 graph');
  assert.ok(v.missing.includes('rng'), '必须指出缺失 rng');
});

test('persistence: validate 拒绝不兼容版本与非对象输入', async () => {
  assert.equal(persistence.validate(null).ok, false);
  const bad = persistence.validate({ schemaVersion: 42, sections: {} });
  assert.equal(bad.ok, false);
  assert.match(String(bad.reason), /版本|兼容/);
});

test('persistence: 状态清单把每个 section 归为核心或控制态', () => {
  const inv = persistence.inventory();
  const list = Array.isArray(inv) ? inv : (inv.sections ?? []);
  assert.ok(list.length >= 30, '状态清单不应少于 30 项');
  for (const item of list) {
    assert.ok(['core', 'control'].includes(item.kind), 'section ' + item.name + ' 的 kind 非法');
    assert.equal(typeof item.name, 'string');
  }
  assert.ok(state.SECTIONS.some((s) => s.name === 'graph'), 'graph 必须在清单里');
});

// ---- 4. 恢复无损（JSON 往返） ----

test('persistence: 存档经 JSON 往返后恢复无损（逐 section 比对）', async () => {
  await loop.run({ ...BASE, ticks: 3 });
  const full = persistence.saveRun({ now: 3 });
  const before = state.capture();
  const beforePosts = posts.list().length;
  assert.ok(beforePosts > 0, '前置条件：运行后应已有帖子');

  // 关键：先过一遍 JSON——磁盘存档就是这条路径。
  const onDisk = JSON.parse(JSON.stringify(full));
  loop.reset();
  const res = persistence.restoreRun(onDisk);
  assert.equal(res.validation.ok, true);
  assert.equal(res.migratedFrom, null);

  const after = state.capture();
  assert.deepEqual(after.skipped, [], '恢复后不应有 section 采集失败');

  for (const sec of state.SECTIONS) {
    const a = before.sections[sec.name];
    const b = after.sections[sec.name];
    assert.notEqual(a, undefined, '采集缺少 section ' + sec.name);
    assert.notEqual(b, undefined, '恢复后采集缺少 section ' + sec.name);
    if (sec.name === 'graph') {
      // graph 的 generation 计数器在恢复后必然自增（用于让派生缓存失效），
      // 因此只比对事实数据 records。
      assert.deepEqual(b.records, a.records, 'graph records 必须逐条一致');
      continue;
    }
    if (sec.name === 'stageProgress') {
      // t25：本模块是**唯一**故意不满足「恢复后逐字段一致」的 section，
      // 所以必须被显式列出，而不是让上面那行通用断言替它背书。
      //
      // 逐字段说清各自为什么：
      //   backgroundDriver —— 入档的**当下事实**，恢复后必须一致（这是本 section 的正文）。
      //   dropped          —— 采集当时的**描述性元数据**，恢复后按实况重算，
      //                       所以它**本来就不该**相等（before 里 recent=3，
      //                       after 里 recent=0 —— 那恰恰证明历史没被恢复回来）。
      assert.equal(b.backgroundDriver, a.backgroundDriver,
        'backgroundDriver 是可恢复子集，必须逐位一致');
      assert.deepEqual(b.dropped, { recent: 0, currentTick: false },
        '恢复后不应残留任何观测历史：dropped 必须如实反映「什么都没恢复」');
      assert.deepEqual(Object.keys(b).sort(), ['backgroundDriver', 'dropped'],
        'stageProgress 的存档面只应是 backgroundDriver(+dropped 描述元数据)');
      continue;
    }
    assert.deepEqual(b, a, 'section ' + sec.name + ' 恢复后必须与原状一致');
  }
  assert.equal(posts.list().length, beforePosts, '帖子索引必须完整回来');
});

test('persistence: 仅图存档恢复后派生索引从图重建，而不是被清空', async () => {
  await loop.run({ ...BASE, ticks: 3 });
  const full = persistence.saveRun({ now: 3 });
  const beforePosts = posts.list().length;
  assert.ok(beforePosts > 0, '前置条件：运行后应已有帖子');

  // 模拟 v1 档：只有 records，没有 sections。
  const graphOnly = { schemaVersion: 1, records: full.records, meta: {} };
  loop.reset();
  const res = archive.load(graphOnly, {
    graph,
    __reset: graph.__reset,
    restoreSections: (s) => state.restore(s),
  });
  assert.equal(res.migratedFrom, 1);
  // 回归：ensureFresh 曾经只 clear() 不重建，导致任何一次 graph 复位后
  // 派生索引全空——图里明明存着帖子，list() 却返回 []（静默数据丢失）。
  assert.equal(
    posts.list().length,
    beforePosts,
    '派生索引必须从图重建；返回空说明 ensureFresh 退化为「只清空」',
  );
});

// ---- 5. 独立进程等价（跨进程，非同进程重放） ----

/**
 * 子进程脚本：单进程内要么「连续跑」，要么「恢复后接着跑」，
 * 两者都输出同一份规范化状态摘要供父进程比对。
 *
 * 摘要剥离墙钟时间戳（Date.now 派生的 ts/createdAt/...）：它们不是仿真状态，
 * 跨进程必然不同；除此之外的**全部**字段都必须逐位一致。
 */
const CHILD_SCRIPT = `
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const root = process.cwd();
const imp = (p) => import(pathToFileURL(root + '/src/' + p).href);

const loop = await imp('runtime/orchestrator/loop.js');
const persistence = await imp('runtime/persistence.js');
const clock = await imp('runtime/clock.js');
const registry = await imp('runtime/registry.js');
const stage2 = await imp('runtime/orchestrator/_stage2.js');
const stage3 = await imp('runtime/orchestrator/_stage3.js');
const worldState = await imp('runtime/world-state.js');
const meter = await imp('survival/needs/meter.js');
const rng = await imp('infra/rng.js');
const graph = await imp('infra/store/graph.js');
const contention = await imp('agent/decision/contention.js');
const goals = await imp('agent/decision/goals.js');

const WALLCLOCK = /"(ts|createdAt|updatedAt|startedAt|savedAt|at)":\\d+/g;
const norm = (v) => JSON.stringify(v).replace(WALLCLOCK, (m, k) => '"' + k + '":0');

function digest() {
  const agents = registry.lookup({ type: 'agent' }).map((a) => a.id).sort();
  return {
    tick: clock.now().tick,
    rng: rng.__snapshot(),
    agents,
    needs: agents.map((id) => id + '=' + norm(meter.query({ agentId: id }).needs)),
    nodes: graph.read({}).map((n) => n.id + '#' + n.type).sort(),
    world: norm(worldState.snapshot()),
    s2: norm(stage2.summary()),
    s3: norm(stage3.summary()),
    // t23：争用账本与目标规划状态纳入跨进程摘要。
    // 只比对**仿真相关**字段：账本的 tick/opened/pools（容量+已预支）都是世界派生量，
    // 恢复后必须逐位一致；墙上时钟字段由 norm 统一剥离。
    contention: contention.__snapshot(),
    goals: {
      count: goals.__snapshot().plans.length,
      cooldown: goals.__snapshot().cooldown.length,
      stats: goals.__snapshot().stats,
    },
  };
}

const mode = process.argv[2];
const snapPath = process.argv[3];
const outPath = process.argv[4];
const BASE = { seed: 7, agentCount: 4, phase2: true, phase3: true };
const HALF = 3;

if (mode === 'continuous') {
  await loop.run({ ...BASE, ticks: HALF });
  writeFileSync(snapPath, JSON.stringify(persistence.saveRun({ now: HALF })));
  for (let i = 0; i < HALF; i += 1) await loop.step(BASE);
  writeFileSync(outPath, JSON.stringify(digest()));
} else if (mode === 'resumed') {
  const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
  persistence.restoreRun(snap);
  for (let i = 0; i < HALF; i += 1) await loop.step(BASE);
  writeFileSync(outPath, JSON.stringify(digest()));
} else {
  throw new Error('unknown mode: ' + mode);
}
`;

test('persistence: 独立进程恢复后续跑与连续运行等价', () => {
  const dir = mkdtempSync(join(tmpdir(), 'truman-persist-'));
  const child = join(dir, 'child.mjs');
  const snapPath = join(dir, 'snap.json');
  const contPath = join(dir, 'continuous.json');
  const resPath = join(dir, 'resumed.json');
  writeFileSync(child, CHILD_SCRIPT);

  try {
    // 进程 A：连续跑 HALF，存一次档，再接着跑 HALF。
    const a = spawnSync(process.execPath, [child, 'continuous', snapPath, contPath], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 180000,
    });
    assert.equal(a.status, 0, '连续运行子进程必须成功：' + (a.stderr || '').slice(-2000));

    // 进程 B：全新进程，只读存档恢复，然后跑同样的 HALF。
    const b = spawnSync(process.execPath, [child, 'resumed', snapPath, resPath], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 180000,
    });
    assert.equal(b.status, 0, '恢复运行子进程必须成功：' + (b.stderr || '').slice(-2000));

    const cont = JSON.parse(readFileSync(contPath, 'utf8'));
    const res = JSON.parse(readFileSync(resPath, 'utf8'));

    assert.equal(res.tick, cont.tick, '恢复后必须从存档 tick 继续，而不是从 0 重新计时');
    assert.ok(cont.tick >= 6, '前置条件：两进程都应推进到 tick 6');

    for (const key of Object.keys(cont)) {
      assert.deepEqual(res[key], cont[key], '跨进程续跑在第「' + key + '」项上与原世界分叉');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


// ---- t23：共享池争用账本入档 ----

/**
 * t23：争用账本（pools/capacity/reserved/currentTick/opened）必须随存档往返。
 *
 * 与 goals/outcomeModel 的**区别**要写清楚，否则后人会误判它的重要性：
 * 本账本是**每 tick 派生**的——open(tick, capacities) 在 decide 阶段开头整表重建，
 * capacities 完全取自当时的真实世界（采集池/库存/供应池余额）。
 * 实测：不接本 section 时，跨进程摘要在剥离墙钟字段后**已经逐字节一致**。
 * 入档是为了不让正确性依赖「open 恰好先跑」这个时序巧合，而不是因为在分叉。
 */
test('t23 争用账本：snapshot/restore 往返后容量、已预支与 tick 逐位一致', async () => {
  loop.reset();
  await loop.run({ ticks: 10, seed: 7, agentCount: 6 });

  const before = contention.__snapshot();
  assert.ok(before.pools.length > 0, '前置条件：本局应登记了共享池');
  assert.equal(typeof before.tick, 'number', '前置条件：存档点应处于某个 tick 内');

  const snap = persistence.saveRun({ meta: { test: 't23' } });
  assert.ok(snap.meta.capturedSections.includes('contention'),
    'contention 必须被采集进存档；实际 ' + JSON.stringify(snap.meta.capturedSections));

  // 清空以证明恢复的是真状态，而不是本来就没丢。
  contention.__reset();
  assert.equal(contention.__snapshot().pools.length, 0);

  persistence.restoreRun(snap);
  loop.markRestored();
  assert.deepEqual(contention.__snapshot(), before, '账本必须逐字段复原');

  assert.ok(persistence.inventory().some((i) => i.name === 'contention'),
    'contention 应出现在持久化状态清单中');
});

/**
 * 存档是在**提交边界**采集的，此时账本可能停在「本 tick 已部分预支」的中间态。
 * 这条用例专门锁住这个中间态也能往返——它是账本里唯一不平凡的部分：
 * 若只恢复容量而丢掉 reserved，预想就会以为池是满的，重复预支问题原地复活。
 */
test('t23 争用账本：部分预支的中间态能往返（reserved 不得归零）', async () => {
  loop.reset();
  await loop.run({ ticks: 10, seed: 7, agentCount: 6 });

  const mid = contention.__snapshot();
  const reservedPools = mid.pools.filter((q) => q.reserved > 0);
  assert.ok(reservedPools.length > 0,
    '前置条件：存档点应存在部分预支的池（否则本用例测不到中间态）');

  const snap = persistence.saveRun({ meta: { test: 't23-mid' } });
  contention.__reset();
  persistence.restoreRun(snap);
  loop.markRestored();

  const after = contention.__snapshot();
  for (const q of reservedPools) {
    const got = after.pools.find((z) => z.pool === q.pool);
    assert.ok(got, '池应被恢复：' + q.pool);
    assert.equal(got.reserved, q.reserved, '已预支量必须逐位复原：' + q.pool);
    assert.equal(got.reserved > 0, true, 'reserved 不得因往返而归零：' + q.pool);
  }
});

test('t23 争用账本：残缺/越界的入档数据被修正，而不是让预想读到负数', () => {
  contention.__reset();
  contention.__restore({
    tick: 5,
    opened: true,
    pools: [
      { pool: 'ok', capacity: 10, reserved: 4 },
      { pool: 'over', capacity: 10, reserved: 99 },
      { pool: 'neg', capacity: 10, reserved: -3 },
      { pool: '', capacity: 10, reserved: 1 },
      { capacity: 10, reserved: 1 },
      null,
    ],
  });
  const s = contention.__snapshot();
  assert.equal(s.pools.length, 3, '只有 pool 名合法的记录应收下');
  const over = s.pools.find((q) => q.pool === 'over');
  assert.equal(over.reserved, 10, '越界的预支量应夹到容量，remaining 不得为负');
  const neg = s.pools.find((q) => q.pool === 'neg');
  assert.equal(neg.reserved, 0, '负数预支应夹到 0');
  assert.equal(contention.remaining('over'), 0);
  assert.equal(contention.remaining('ok'), 6);
  assert.equal(contention.tickOf(), 5);
  assert.equal(contention.isOpen(), true);
  contention.__reset();
  assert.equal(contention.tickOf(), null, '复位后 tick 必须归零');
  assert.equal(contention.isOpen(), false);
});
// ---------------------------------------------------------------------------
// 阶段进度的恢复边界（t25）
//
// 本模块的三个状态**不同类**，恢复时不能一刀切。这一组用例把"哪个入档、
// 哪个刻意丢弃"从注释里的口头约定变成可执行的契约。
// ---------------------------------------------------------------------------

test('persistence: 阶段进度的恢复边界——只带 backgroundDriver，recent/currentTick 刻意不入档', async () => {
  await loop.reset();
  stageProgress.__reset();

  // 造出"有历史 + 有进行中 tick + 有后台驱动器"的样子。
  for (let i = 1; i <= 3; i += 1) {
    stageProgress.begin(i);
    stageProgress.unit('regen', null);
    stageProgress.commit(i);
  }
  stageProgress.begin(4);
  stageProgress.unit('regen', null);
  stageProgress.setBackgroundDriver(true);
  assert.equal(stageProgress.recentTicks(10).length, 3, '前置条件：应有 3 条历史');
  assert.notEqual(stageProgress.current(), null, '前置条件：应有进行中的 tick');

  // 采集 → 存档面只应有 backgroundDriver（+ dropped 描述元数据）。
  const snap = stageProgress.__snapshot();
  assert.equal(snap.backgroundDriver, true);
  assert.deepEqual(Object.keys(snap).sort(), ['backgroundDriver', 'dropped'],
    '存档面只应是 backgroundDriver(+dropped 描述元数据)，不得含 recent/currentTick 本体');
  assert.equal(snap.dropped.recent, 3, 'dropped 应如实报告被丢弃的历史条数');
  assert.equal(snap.dropped.currentTick, true);

  // 完整存档（走 state.SECTIONS）-> 恢复。
  const full = persistence.saveRun({ now: 3 });
  assert.ok(full.meta.capturedSections.includes('stageProgress'),
    'stageProgress 必须被采集进存档；实际 ' + JSON.stringify(full.meta.capturedSections));
  const onDisk = JSON.parse(JSON.stringify(full));
  stageProgress.__reset();
  assert.equal(stageProgress.hasBackgroundDriver(), false, '前置条件：__reset 应清零驱动器事实');
  persistence.restoreRun(onDisk);

  // 契约 1：观测历史绝不跨恢复泄漏。
  assert.equal(stageProgress.recentTicks(10).length, 0,
    'recent 历史不得跨恢复泄漏（t16 契约）');
  assert.equal(stageProgress.current(), null,
    '恢复点是提交边界，不得有进行中的 tick');
  assert.equal(stageProgress.lastCommitted(), null,
    'lastCommitted 属观测历史，同样不得泄漏');
  assert.equal(stageProgress.lastFailure(), null);

  // 契约 2：后台驱动器事实被保留（否则观测 API 会谎报 manual-step）。
  assert.equal(stageProgress.hasBackgroundDriver(), true,
    'backgroundDriver 是当下事实，恢复后必须保留——清掉会让 driver 谎报成 manual-step');

  // 契约 3：恢复后 dropped 如实反映"什么都没恢复"。
  assert.deepEqual(stageProgress.__snapshot().dropped, { recent: 0, currentTick: false });
});

test('persistence: 阶段进度恢复边的健壮性——残缺入档数据不得让驱动器事实变成真值', () => {
  const cases = [
    [null, false],
    [undefined, false],
    [{}, false],
    [{ backgroundDriver: 'true' }, false],
    [{ backgroundDriver: 1 }, false],
    [{ backgroundDriver: false }, false],
    [{ backgroundDriver: true }, true],
  ];
  for (const [input, expected] of cases) {
    stageProgress.__reset();
    stageProgress.__restore(input);
    assert.equal(stageProgress.hasBackgroundDriver(), expected,
      '入档 ' + JSON.stringify(input) + ' 应恢复成 ' + expected);
    assert.equal(stageProgress.recentTicks(10).length, 0);
    assert.equal(stageProgress.current(), null);
  }
  // 旧档若**带**了 recent 本体，也必须收敛到同一结果。
  stageProgress.__reset();
  stageProgress.__restore({ backgroundDriver: true, recent: [1, 2, 3], currentTick: { tick: 9 } });
  assert.equal(stageProgress.recentTicks(10).length, 0, '旧档夹带的历史同样不得泄漏');
  assert.equal(stageProgress.current(), null);
  assert.equal(stageProgress.hasBackgroundDriver(), true);
  stageProgress.__reset();
});

test('persistence: __restore 幂等，且 __reset 与 __restore 的分工不可混用', () => {
  stageProgress.__reset();
  stageProgress.setBackgroundDriver(true);
  stageProgress.begin(7);
  stageProgress.unit('regen', null);

  // __restore 保留驱动器事实（世界续跑）。
  stageProgress.__restore(stageProgress.__snapshot());
  assert.equal(stageProgress.hasBackgroundDriver(), true, '__restore 必须保留驱动器事实');
  const once = stageProgress.__snapshot();
  stageProgress.__restore(once);
  assert.deepEqual(stageProgress.__snapshot(), once, '__restore 必须幂等');

  // __reset 全量归零，含驱动器事实（世界重来）。
  stageProgress.__reset();
  assert.equal(stageProgress.hasBackgroundDriver(), false, '__reset 必须连驱动器事实一起归零');
  assert.equal(stageProgress.recentTicks(10).length, 0);
  assert.equal(stageProgress.current(), null);
});

test('persistence: markRestored 保留驱动器事实但清空观测历史（t16 与 t25 的交点）', async () => {
  await loop.reset();
  for (let i = 1; i <= 3; i += 1) {
    stageProgress.begin(i);
    stageProgress.unit('regen', null);
    stageProgress.commit(i);
  }
  stageProgress.begin(4);
  stageProgress.unit('regen', null);
  stageProgress.setBackgroundDriver(true);

  loop.markRestored();

  // t16：观测历史不得跨恢复泄漏。
  assert.equal(stageProgress.recentTicks(10).length, 0, 'markRestored 必须清空 recent');
  assert.equal(stageProgress.current(), null, 'markRestored 必须清空进行中的 tick');
  // t25：但"有没有后台推进器"是当下事实，不能一并忘掉。
  assert.equal(stageProgress.hasBackgroundDriver(), true,
    'markRestored 不得把仍在运行的后台驱动器事实一并清掉');
  // 提交边界对齐。
  assert.equal(loop.tickStatus().inFlight, false);
  assert.equal(loop.tickStatus().committedTick, loop.tickStatus().tick);

  // 对照：loop.reset()（新一局）则应当全量归零。
  await loop.reset();
  assert.equal(stageProgress.hasBackgroundDriver(), false,
    'loop.reset 是新一局，必须连驱动器事实一起归零');
});

// ---- t27：跨规模跨进程恢复等价 ----

/**
 * 参数化子进程（4/6/10/20 人口、可配 H/K/seed），逐 tick 输出行为态与观测态。
 *
 * 与上面的 CHILD_SCRIPT 同构：都写成模板字符串、运行时落到临时目录再 spawn。
 * 之所以不放到 test/fixtures/：那会在本任务的 in-scope 路径之外新增文件。
 */
const SERIES_CHILD_SCRIPT = `

/**
 * 跨规模跨进程等价子进程（t27）。
 *
 * 用法：node persistence-child-series.mjs <mode> <snapPath> <outPath> <agentCount> <H> <K> <seed>
 *   mode=continuous —— 跑 H tick，存档，再跑 K tick，逐 tick 输出样本
 *   mode=resumed    —— 全新进程，只读存档恢复，再跑 K tick，逐 tick 输出样本
 *
 * 输出：JSON 数组，每个元素是一次采样，形状为
 *   { state: {...}, observation: {...} }
 * 其中 state 是**行为/资源状态**（跨进程必须逐位一致），
 * observation 是**本进程的观测元数据**（刻意不恢复，跨进程预期不同）。
 *
 * 为什么把两类分开输出，而不是混在一个对象里：
 * t6 报的「6/10/20 人从 H+2 分叉」实测就是分类错误——
 * stageProgress.dropped.recent 是「本进程此刻手里有几条观测」，
 * 连续进程 = H+K 条、恢复进程 = K 条，混在一起比对会**每个 tick 都报分叉**，
 * 看起来像严重的恢复缺陷，实际行为状态逐位一致。
 * craftJobs.startedAt 是墙钟时间戳，同理。
 */
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const root = process.cwd();
const imp = (p) => import(pathToFileURL(root + '/src/' + p).href);

const loop = await imp('runtime/orchestrator/loop.js');
const persistence = await imp('runtime/persistence.js');
const clock = await imp('runtime/clock.js');
const registry = await imp('runtime/registry.js');
const stage2 = await imp('runtime/orchestrator/_stage2.js');
const stage3 = await imp('runtime/orchestrator/_stage3.js');
const worldState = await imp('runtime/world-state.js');
const meter = await imp('survival/needs/meter.js');
const rng = await imp('infra/rng.js');
const graph = await imp('infra/store/graph.js');
const contention = await imp('agent/decision/contention.js');
const goals = await imp('agent/decision/goals.js');
const stageProgress = await imp('runtime/orchestrator/stage-progress.js');
const craftJobs = await imp('agent/crafting/workbench/executor.js');
const buildJobs = await imp('agent/crafting/construction.js');
const writeJobs = await imp('agent/crafting/writing.js');

/** 墙钟时间戳不是仿真状态：跨进程必然不同，统一剥离后再比对。 */
const WALLCLOCK = /"(ts|createdAt|updatedAt|startedAt|savedAt|at)":\\d+/g;
const norm = (v) => JSON.stringify(v).replace(WALLCLOCK, (m, k) => '"' + k + '":0');
const normObj = (v) => JSON.parse(norm(v));

function sample() {
  const agents = registry.lookup({ type: 'agent' }).map((a) => a.id).sort();
  return {
    state: {
      tick: clock.now().tick,
      rng: rng.__snapshot(),
      agents,
      needs: agents.map((id) => id + '=' + norm(meter.query({ agentId: id }).needs)),
      nodes: graph.read({}).map((n) => n.id + '#' + n.type).sort(),
      world: normObj(worldState.snapshot()),
      s2: normObj(stage2.summary()),
      s3: normObj(stage3.summary()),
      contention: contention.__snapshot(),
      goals: {
        count: goals.__snapshot().plans.length,
        cooldown: goals.__snapshot().cooldown.length,
        stats: goals.__snapshot().stats,
      },
      // 在途任务队列：剥离墙钟后是纯行为状态（remainingTicks/seq 必须一致）
      craftJobs: normObj(craftJobs.__snapshot()),
      buildJobs: normObj(buildJobs.__snapshot()),
      writeJobs: normObj(writeJobs.__snapshot()),
      // 阶段进度只取**可恢复子集**（分类由模块自己声明，见 SNAPSHOT_FIELD_KINDS）
      stageProgress: stageProgress.restorableState(),
    },
    observation: {
      // 刻意不恢复的那部分：正确断言是「按实况重算」，不是「与存档前相等」
      stageProgress: stageProgress.observationalMeta(),
      recentTicks: stageProgress.recentTicks(64).length,
    },
  };
}

const mode = process.argv[2];
const snapPath = process.argv[3];
const outPath = process.argv[4];
const agentCount = Number(process.argv[5]);
const H = Number(process.argv[6]);
const K = Number(process.argv[7]);
const seed = Number(process.argv[8]);
const BASE = { seed, agentCount, phase2: true, phase3: true };

const series = [];
if (mode === 'continuous') {
  await loop.run({ ...BASE, ticks: H });
  writeFileSync(snapPath, JSON.stringify(persistence.saveRun({ now: H })));
  for (let i = 0; i < K; i += 1) { await loop.step(BASE); series.push(sample()); }
} else if (mode === 'resumed') {
  persistence.restoreRun(JSON.parse(readFileSync(snapPath, 'utf8')));
  for (let i = 0; i < K; i += 1) { await loop.step(BASE); series.push(sample()); }
} else {
  throw new Error('unknown mode: ' + mode);
}
writeFileSync(outPath, JSON.stringify(series));


`;

/** 父进程侧墙钟剥离（与子进程同一口径：墙钟不是仿真状态）。 */
const WALLCLOCK_P = /"(ts|createdAt|updatedAt|startedAt|savedAt|at)":\d+/g;
const normP = (v) => JSON.parse(JSON.stringify(v).replace(WALLCLOCK_P, (m, k) => '"' + k + '":0'));

/**
 * 父进程侧采样：**只取行为/资源状态**。
 * 刻意不含 stageProgress.dropped —— 它是观测元数据，跨进程预期不同。
 */
function sampleState() {
  const agents = registry.lookup({ type: 'agent' }).map((a) => a.id).sort();
  return {
    tick: clock.now().tick,
    rng: rng.__snapshot(),
    agents,
    needs: agents.map((id) => id + '=' + JSON.stringify(normP(meter.query({ agentId: id }).needs))),
    nodes: graph.read({}).map((n) => n.id + '#' + n.type).sort(),
    craftJobs: normP(craftJobs.__snapshot()),
    stageProgress: stageProgress.restorableState(),
  };
}

/** 逐 tick 比较两组采样，返回全部分叉点（空数组 = 等价）。 */
function compareSeries(a, b) {
  const diffs = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    for (const k of Object.keys(a[i])) {
      if (JSON.stringify(a[i][k]) !== JSON.stringify(b[i][k])) {
        diffs.push('H+' + (i + 1) + ' 字段 ' + k);
      }
    }
  }
  return diffs;
}

/**
 * t27 核心用例：4/6/10/20 人口下，跨进程恢复后行为/资源逐 tick 等价至 H+K。
 *
 * t6 的 F2 报「4 人通过、6/10/20 人从 H+2 分叉」。实测定位到的**不是行为缺陷**，
 * 而是两类**观测元数据**被当成了行为状态严格比对：
 *   1. stageProgress.dropped.recent —— 「本进程此刻手里有几条观测」。
 *      连续进程 = H+K 条、恢复进程 = K 条，因此**每个 tick** 都会被判分叉。
 *      它是刻意不恢复的（t16/t25 契约：recent 恢复后必须为空）。
 *   2. craftJobs.startedAt —— 墙钟时间戳，跨进程必然不同。
 * 而 rng.position 实测**逐位一致**（并非分叉源）。
 *
 * 所以本用例把「行为/资源状态」与「观测元数据」分开：
 * 前者严格逐位比对，后者断言「恢复后按实况重算」。
 * 绝不为了凑 deepEqual 去恢复历史 recent —— 那等于把观测杂质变成契约。
 */
test('persistence: 跨规模跨进程恢复等价（4/6/10/20 人口，逐 tick 至 H+K）', () => {
  const H = 10;
  const K = 5;
  const SEED = 7;
  const dir = mkdtempSync(join(tmpdir(), 'truman-t27-'));
  const seriesChild = join(dir, 'series-child.mjs');
  const snapPath = join(dir, 'snap.json');
  const contPath = join(dir, 'cont.json');
  const resPath = join(dir, 'res.json');
  writeFileSync(seriesChild, SERIES_CHILD_SCRIPT);

  try {
    for (const agentCount of [4, 6, 10, 20]) {
      const run = (mode, out) => spawnSync(process.execPath, [
        seriesChild, mode, snapPath, out,
        String(agentCount), String(H), String(K), String(SEED),
      ], { cwd: process.cwd(), encoding: 'utf8', timeout: 300000 });

      const a = run('continuous', contPath);
      assert.equal(a.status, 0, 'agentCount=' + agentCount + ' 连续运行子进程必须成功：' + (a.stderr || '').slice(-2000));
      const b = run('resumed', resPath);
      assert.equal(b.status, 0, 'agentCount=' + agentCount + ' 恢复运行子进程必须成功：' + (b.stderr || '').slice(-2000));

      const cont = JSON.parse(readFileSync(contPath, 'utf8'));
      const res = JSON.parse(readFileSync(resPath, 'utf8'));
      assert.equal(cont.length, K, '前置条件：应采集到 H+1..H+K 共 K 个采样');
      assert.equal(res.length, K, '前置条件：恢复进程同样应采集到 K 个采样');

      // 前置条件（防空转）：在途任务必须非空、随机流必须真的在动。
      // 少了这两条，"等价"可能只是因为比的是空集合。
      assert.ok(cont.some((s) => s.state.craftJobs.pending.length > 0),
        'agentCount=' + agentCount + ' 前置条件：在途制作任务必须非空，否则 craftJobs 比较是空集');
      assert.ok(new Set(cont.map((s) => s.state.rng.position)).size > 1,
        'agentCount=' + agentCount + ' 前置条件：rng 流位置必须逐 tick 变化，否则随机流等价无从谈起');

      // 用**与缺陷注入用例同一个**比较器：否则"注入能使其失败"证明的是另一个函数。
      const diffs = compareSeries(cont.map((s) => s.state), res.map((s) => s.state));
      assert.deepEqual(diffs, [],
        'agentCount=' + agentCount + ' 跨进程恢复在 H+K 内出现行为分叉：' + diffs.join('; '));

      // 观测元数据：必须**只反映本进程自己跑出来的 tick**，而不是继承上一个进程的历史。
      // 恢复进程跑到 H+i+1 时手里只应有 i+1 条；连续进程则有完整的 H+i+1 条。
      // 两者**本来就不该相等**——这正是它们不能参与行为等价比较的原因。
      for (let i = 0; i < K; i += 1) {
        assert.equal(res[i].observation.stageProgress.recent, i + 1,
          '恢复进程的观测历史必须只含它自己产生的 tick（不得继承存档前进程的 ' + H + ' 条）');
        assert.equal(res[i].observation.recentTicks, i + 1,
          'recentTicks 同样只应是本进程的观测');
        assert.equal(cont[i].observation.stageProgress.recent, H + i + 1,
          '连续进程的观测历史应是完整的 H+i+1 条');
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * 观测元数据的分类必须是**模块声明的契约**，不是各比较方各自硬编码的知识。
 */
test('persistence: 观测元数据按语义排除比较，且 recent 恢复后为空', async () => {
  await loop.reset();
  stageProgress.__reset();
  await loop.run({ ...BASE, ticks: 5 });

  const before = stageProgress.__snapshot();
  assert.ok(before.dropped.recent > 0, '前置条件：连续运行后应已积累观测历史');

  // 分类由拥有该语义的模块自己声明，比较方查询即可。
  const kinds = state.sectionFieldKinds('stageProgress');
  assert.equal(kinds.backgroundDriver, 'state', 'backgroundDriver 是可恢复的行为状态');
  assert.equal(kinds.dropped, 'observation', 'dropped 是本进程的观测元数据');
  const inv = state.inventory().find((s) => s.name === 'stageProgress');
  assert.ok(inv && inv.fieldKinds && inv.fieldKinds.dropped === 'observation',
    'inventory 必须暴露分类，否则审计工具只能靠猜');

  const onDisk = JSON.parse(JSON.stringify(persistence.saveRun({ now: 5 })));
  persistence.restoreRun(onDisk);
  const after = stageProgress.__snapshot();

  // 行为状态：必须一致。
  assert.equal(after.backgroundDriver, before.backgroundDriver, '可恢复子集必须逐位一致');
  // 观测元数据：必须按实况重算。
  assert.equal(stageProgress.recentTicks(64).length, 0, 'recent 历史不得跨恢复泄漏');
  assert.equal(after.dropped.recent, 0, '恢复后 dropped 必须如实反映「什么都没恢复」');
  assert.notEqual(after.dropped.recent, before.dropped.recent,
    '两者若相等，说明 recent 被错误地恢复了——那正是本任务禁止的「为了 deepEqual 恢复历史观测」');
});

/**
 * 缺陷注入：证明等价比较**既不是空转的，也不是过度宽容的**。
 *
 * 只在两边都成立时，上面那条跨规模用例才有意义：
 *   (1)(3) 破坏行为状态 -> 必须检出分叉（否则比较是摆设）
 *   (2)    只扰动观测元数据 -> 必须**不**报分叉（否则是在用"全排除"掩盖问题）
 */
test('persistence: 缺陷注入——行为状态被破坏必须被检出，观测元数据扰动不得误报', async () => {
  const H = 6;
  const K = 3;
  await loop.reset();
  await loop.run({ ...BASE, ticks: H });
  const base = JSON.parse(JSON.stringify(persistence.saveRun({ now: H })));

  const branch = async (mutate) => {
    const snap = JSON.parse(JSON.stringify(base));
    if (mutate) mutate(snap);
    await loop.reset();
    persistence.restoreRun(snap);
    const out = [];
    for (let i = 0; i < K; i += 1) { await loop.step(BASE); out.push(sampleState()); }
    return out;
  };

  const clean = await branch(null);
  assert.ok(clean.some((s) => s.craftJobs.pending.length > 0),
    '前置条件：在途制作任务必须非空，否则注入实验可能空转');

  // (1) 破坏随机流起点 -> 必须检出。
  const rngBad = await branch((snap) => {
    snap.sections.rng.position = (snap.sections.rng.position + 7919) % 4294967296;
  });
  assert.ok(compareSeries(clean, rngBad).length > 0,
    '注入随机流位置偏移后必须检出分叉——否则跨规模等价用例是空转的');

  // (2) 只扰动观测元数据 -> 不得误报。
  const obsBad = await branch((snap) => { snap.sections.stageProgress.dropped.recent = 999; });
  assert.deepEqual(compareSeries(clean, obsBad), [],
    '只扰动观测元数据不得报分叉：它是刻意不恢复的，不是行为状态');
  // 入档里被塞进 dropped.recent=999，恢复进程手里仍只应有它自己跑出的 K 条：
  // 若这条断言变成 999（或 K+999），说明观测元数据被当成了可恢复状态。
  assert.equal(stageProgress.recentTicks(64).length, K,
    '入档里的观测元数据不得被还原成真观测历史：恢复进程只应看到自己跑出的 K 条');

  // (3) 破坏在途任务的行为状态 -> 必须检出。
  const craftBad = await branch((snap) => {
    const pending = snap.sections.craftJobs.pending;
    if (Array.isArray(pending) && pending.length > 0) {
      pending[0].remainingTicks = (pending[0].remainingTicks ?? 0) + 5;
    } else {
      snap.sections.craftJobs.seq = (snap.sections.craftJobs.seq ?? 0) + 100;
    }
  });
  assert.ok(compareSeries(clean, craftBad).length > 0,
    '注入在途任务进度偏移后必须检出分叉');

  // (4) 破坏 stageProgress 的**行为**字段（backgroundDriver）-> 必须检出。
  //     这条与 (2) 配对：同一个 section 里，行为字段不得被"顺手一起排除"。
  //     若有人图省事把整个 stageProgress 排除出比较，(4) 会立刻失败。
  const spBad = await branch((snap) => { snap.sections.stageProgress.backgroundDriver = true; });
  assert.ok(compareSeries(clean, spBad).length > 0,
    '注入 backgroundDriver 偏移后必须检出分叉——同一个 section 的行为字段不得被一并排除');
});
