/**
 * t8 回归：挂机节拍器、停止语义与自动保存边界。
 *
 * 这些用例锁定的是**真实墙钟行为**，不是纯函数返回值——挂机是"时间"这件事本身
 * 第一次进入这个项目，因此测试必须证明：
 *   1. tick↔现实时间的映射存在、可配置、有默认值（37.5 秒/tick）；
 *   2. 倍速真的改变流转速度（墙钟对照，而不只是回读配置）；
 *   3. 停止**一定跑完当前 tick**，世界落在提交边界上（绝不停在半推进状态）；
 *   4. 暂停期间没有任何 tick 前进；
 *   5. 自动保存只在提交边界发生、按间隔节流、失败不杀死世界但不静默；
 *   6. 观测 API 的 background/driver/state 与节拍器同源（不再有"看起来在跑其实没跑"）；
 *   7. 默认**不启动**后台推进器——既有批处理/手动步进用法完全不受影响。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../src/api/index.js';
import * as control from '../src/api/control.js';
import * as observerApi from '../src/api/observer.js';
import * as metronome from '../src/runtime/orchestrator/metronome.js';
import * as stageProgress from '../src/runtime/orchestrator/stage-progress.js';
import { loop } from '../src/runtime/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 复位循环 + 控制 + 节拍器（节拍器必须一起复位，否则后台 timer 会跨用例泄漏）。 */
function fresh() {
  loop.reset();
  control.__reset();
}

/** 轮询等待条件成立；返回是否等到。 */
async function waitFor(predicate, timeoutMs = 8000, stepMs = 5) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(stepMs);
  }
}

// ---- 节奏映射：可配置，不是不可变常量 ----

test('节拍：默认 37.5 秒/tick（24 tick/天 × 15 分钟/天），且可配置', () => {
  fresh();
  const p0 = metronome.pacing();
  assert.equal(p0.msPerTick, 37500, '默认应为 37500ms = 37.5 秒/tick');
  assert.equal(p0.msPerTickSource, 'default');
  assert.equal(p0.speed, 1);
  assert.equal(p0.effectiveMsPerTick, 37500);
  assert.equal(p0.unpaced, false);
  assert.equal(metronome.DEFAULT_AUTOSAVE_EVERY_TICKS, 20, '默认每 20 tick（≈游戏内一天）自动保存');

  // 它是**默认值**而非不可变常量：显式配置必须生效，且来源可查。
  const p1 = metronome.configure({ msPerTick: 1200, speed: 4 });
  assert.equal(p1.msPerTick, 1200);
  assert.equal(p1.msPerTickSource, 'configured');
  assert.equal(p1.effectiveMsPerTick, 300, '倍速在 msPerTick 之上再除：1200/4');

  // 0 表示全速不摊时间（挂机与快进的同一旋钮两端）。
  assert.equal(metronome.configure({ msPerTick: 0 }).unpaced, true);
});

test('节拍：msPerTick 与 speed 的边界校验（非法配置立刻报错而不是静默钳制）', () => {
  fresh();
  assert.throws(() => metronome.configure({ speed: 0 }), /speed/);
  assert.throws(() => metronome.configure({ speed: -1 }), /speed/);
  assert.throws(() => metronome.configure({ speed: Number.NaN }), /speed/);
  assert.throws(() => metronome.configure({ msPerTick: -1 }), /msPerTick/);
  assert.throws(() => metronome.configure({ msPerTick: metronome.MAX_MS_PER_TICK + 1 }), /msPerTick/);
  // 上下限内的极值合法
  assert.equal(metronome.configure({ speed: metronome.MAX_SPEED * 10 }).speed, metronome.MAX_SPEED);
  assert.equal(metronome.configure({ msPerTick: 0 }).msPerTick, 0);
});

// ---- 真实推进 + 观测 API 同源 ----

test('挂机：节拍器真的按墙钟推进 tick，并把提交边界带到观测 API', async () => {
  fresh();
  control.start({ agentCount: 2, background: true, msPerTick: 25 });
  try {
    assert.ok(await waitFor(() => loop.tickStatus().committedTick >= 3),
      '节拍器应在超时前提交至少 3 个 tick');
    // ticksRun 是节拍器自己的「我驱动完几个 tick」计数，在 runPacedTick 返回后自增，
    // 因此它与 loop 的 committedTick 之间**存在一个微任务的窗口**（committedTick 已 +1、
    // ticksRun 还没 +1）。断言哪个计数就等哪个计数，不要用另一个的成立去推断它。
    assert.ok(await waitFor(() => metronome.status().ticksRun >= 3),
      '节拍器应已驱动完至少 3 个 tick');

    const s = observerApi.simStatus();
    assert.equal(s.background, true, '接入节拍器后 background 必须为 true');
    assert.equal(s.driver, 'metronome', 'driver 必须变成 metronome');
    assert.ok(s.state === 'running' || s.state === 'advancing', 'state 应为 running/advancing，实际 ' + s.state);
    assert.ok(s.committedTick >= 3);
    assert.equal(s.stopping, false);

    const st = metronome.status();
    assert.ok(st.ticksRun >= 3, 'ticksRun 应 >= 3，实际 ' + st.ticksRun);
    assert.ok(Number.isFinite(st.lastTickMs) && st.lastTickMs > 0, '应记录上一 tick 的墙上耗时');
    assert.equal(st.msPerTick, 25);
    assert.equal(st.effectiveMsPerTick, 25);
  } finally {
    await control.stop({ wait: true });
  }
});

test('挂机：倍速真的改变流转速度（墙钟对照，而非只回读配置）', async () => {
  const ticksIn = async (windowMs, msPerTick, speed) => {
    fresh();
    control.start({ agentCount: 2, background: true, msPerTick, speed });
    await sleep(windowMs);
    const n = metronome.status().ticksRun;
    await control.stop({ wait: true });
    return n;
  };
  const slow = await ticksIn(500, 100, 1);
  const fast = await ticksIn(500, 100, 10);
  assert.ok(slow >= 1, '1 倍速下 500ms 内应至少推进 1 个 tick，实际 ' + slow);
  assert.ok(fast > slow, '10 倍速应推进更多 tick（slow=' + slow + ' fast=' + fast + '）');
  assert.ok(fast >= slow * 2, '10 倍速应至少快 2 倍（slow=' + slow + ' fast=' + fast + '）');
});

test('挂机：已提交阶段进度可被观测（committed 的阶段时间线）', async () => {
  fresh();
  control.start({ agentCount: 2, background: true, msPerTick: 25 });
  try {
    assert.ok(await waitFor(() => loop.tickStatus().committedTick >= 2));
  } finally {
    await control.stop({ wait: true });
  }
  // 先停下再断言：节拍器每 ~25ms 就提交一个新 tick，运行中跨两次读取做
  // 「lastCommitted().tick === committedTick」这类一致性断言必然偶发失败
  // （读到的是两个不同时刻的世界）。停下来之后世界静止，读数才是一致快照。
  {
    const t = loop.tickStatus();
    const recent = stageProgress.recentTicks(5);
    assert.ok(recent.length >= 1, '应有已提交 tick 的阶段记录');
    const last = recent[recent.length - 1];
    assert.equal(last.status, 'committed');
    assert.ok(last.stages.length > 0, '提交的 tick 应带阶段时间线');
    assert.ok(last.unitCount > 0);
    assert.ok(Number.isFinite(last.totalMs) && last.totalMs > 0);
    assert.equal(stageProgress.lastCommitted().tick, t.committedTick);
  }
  // "没有进行中的阶段记录"只有在节拍器停下之后才是可断言的：
  // 运行中随时可能有下一个 tick 正在推进（那正是它该有的样子）。
  assert.equal(stageProgress.current(), null, '停止后不得残留进行中的阶段记录');
});

test('节拍：按实测阶段耗时权重摊分（权重自标定，来自真实 work 时间）', async () => {
  fresh();
  control.start({ agentCount: 3, background: true, msPerTick: 30 });
  try {
    assert.ok(await waitFor(() => loop.tickStatus().committedTick >= 3));
    const st = metronome.status();
    assert.ok(Array.isArray(st.stageWeights) && st.stageWeights.length > 0, '应记录阶段耗时权重');
    const ids = st.stageWeights.map((w) => w.id);
    assert.ok(ids.includes('regen'), '权重应覆盖 tick 序列的阶段，实际 ' + JSON.stringify(ids.slice(0, 12)));
    for (const w of st.stageWeights) {
      assert.ok(w.ms > 0, '阶段权重必须为正（否则该阶段会被判成"不需要时间"）：' + w.id + '=' + w.ms);
    }
  } finally {
    await control.stop({ wait: true });
  }
});

// ---- 停止语义 ----

/**
 * 关于"如何在推进中请求停止"的一个非显然事实：
 * tick 的计算体是**同步**的（包在 async 里，其 await 只消耗微任务），因此在 tick
 * 正在计算的那几十毫秒里，事件循环根本转不动——外部**观察不到** inFlight=true。
 * inFlight 只有在 tick 被**摊开**（逐单元 sleep，从而让出宏任务）时才对观察者可见。
 * 而逐单元摊分需要已有上一个 tick 的排程，所以必须让 tick 数 >= 2：
 *   tick 1：无排程 → 只在末尾补足整周期（inFlight 不可见）；
 *   tick 2+：有排程 → 400ms 被摊到各阶段边界上（inFlight 可见约 400ms）。
 * 用 msPerTick=0 做这条用例是错的：它永远观察不到 inFlight。
 */
test('停止：必须跑完当前 tick，世界落在提交边界上（绝不停在半推进状态）', async () => {
  fresh();
  control.start({ agentCount: 12, background: true, msPerTick: 400 });
  assert.ok(await waitFor(() => loop.tickStatus().inFlight === true, 15000, 5),
    '应能在某个 tick 被摊开推进时观察到 inFlight=true');
  const observed = loop.tickStatus();
  assert.equal(observed.inFlight, true);

  await control.stop({ wait: true });

  const t = loop.tickStatus();
  assert.equal(t.inFlight, false, '停止后不得仍有 tick 在飞');
  assert.equal(stageProgress.current(), null, '停止后不得留下半截阶段记录');
  assert.equal(t.tick, t.committedTick, '停止后世界必须落在提交边界（tick == committedTick）');
  assert.ok(t.committedTick >= observed.inFlightTick,
    '请求停止时正在跑的那个 tick 必须跑完并提交（inFlightTick=' + observed.inFlightTick + ' committed=' + t.committedTick + '）');
  assert.ok(t.committedTick > observed.committedTick, '停止前已开始的 tick 不得被丢弃');
  assert.equal(control.currentPhase(), 'stopped');
  assert.equal(stageProgress.hasBackgroundDriver(), false, '停止后必须注销后台推进器');
});

test('挂机：与手动 step 互斥，不会有两个生成器交错撕裂世界', async () => {
  fresh();
  // 同样需要"摊开的 tick"才能观察到推进中（见上一条用例的说明）。
  control.start({ agentCount: 12, background: true, msPerTick: 400 });
  try {
    assert.ok(await waitFor(() => loop.tickStatus().inFlight === true, 15000, 5));
    // 节拍器正在推进时手动 step 必须被拒绝（409），而不是交错推进同一份共享状态。
    await assert.rejects(() => control.step({ eventProbability: 0 }), (e) => e.status === 409);
    assert.equal(loop.tickStatus().inFlight, true, '节拍器应仍在推进');
  } finally {
    await control.stop({ wait: true });
  }
  const t = loop.tickStatus();
  assert.equal(t.tick, t.committedTick, '收尾后仍必须落在提交边界');
});

test('挂机：手动 step 在飞时启动节拍器会让路，不撕裂那一 tick', async () => {
  fresh();
  control.start({ agentCount: 3 });
  const pending = control.step({ eventProbability: 0 });
  assert.equal(loop.tickStatus().inFlight, true, '手动 step 应已进入进行中');
  metronome.start({ msPerTick: 0 });
  try {
    const res = await pending;
    assert.equal(res.tick, 1, '被让路的手动 step 必须照常完成');
    assert.ok(await waitFor(() => loop.tickStatus().committedTick >= 3, 10000));
  } finally {
    await metronome.stop({ wait: true });
    control.__reset();
  }
  const t = loop.tickStatus();
  assert.equal(t.inFlight, false);
  assert.equal(t.tick, t.committedTick);
});

test('停止后相位为 stopped：不回退成"从未启动"，也不冒充有后台', async () => {
  fresh();
  control.start({ agentCount: 2, background: true, msPerTick: 20 });
  assert.ok(await waitFor(() => loop.tickStatus().committedTick >= 1));
  await control.stop({ wait: true });

  const s = observerApi.simStatus();
  assert.equal(s.phase, 'stopped');
  assert.equal(s.state, 'stopped');
  assert.equal(s.stateReason, 'operator_stopped');
  assert.equal(s.background, false);
  assert.equal(s.driver, 'none');
  assert.equal(s.stopping, false);
  assert.equal(typeof s.stateDescription, 'string');
  const t = loop.tickStatus();
  assert.equal(t.tick, t.committedTick, '停止后仍是可续跑的提交边界');
});

test('挂机：暂停期间不推进，恢复后继续（且 state=paused 与 stopped 区分）', async () => {
  fresh();
  control.start({ agentCount: 2, background: true, msPerTick: 20 });
  try {
    assert.ok(await waitFor(() => loop.tickStatus().committedTick >= 1));
    control.pause();
    await sleep(120); // 让可能在飞的 tick 跑完——暂停只在 tick 之间生效
    const c1 = loop.tickStatus().committedTick;
    await sleep(200);
    const c2 = loop.tickStatus().committedTick;
    assert.equal(c2, c1, '暂停期间不得推进任何 tick');

    const s = observerApi.simStatus();
    assert.equal(s.phase, 'paused');
    assert.equal(s.state, 'paused');
    assert.equal(s.stateReason, 'operator_paused');

    control.resume();
    assert.equal(control.currentPhase(), 'running');
    assert.ok(await waitFor(() => loop.tickStatus().committedTick > c2), '恢复后应继续推进');
  } finally {
    await control.stop({ wait: true });
  }
});

test('挂机：停止后可再次 start 继续，世界与人口不丢、不重复 spawn', async () => {
  fresh();
  control.start({ agentCount: 2, background: true, msPerTick: 20 });
  assert.ok(await waitFor(() => loop.tickStatus().committedTick >= 2));
  await control.stop({ wait: true });
  const c1 = loop.tickStatus().committedTick;
  assert.equal(control.currentPhase(), 'stopped');
  assert.equal(loop.snapshot().agents.length, 2, '停止不重置世界');

  control.start({ background: true, msPerTick: 20 });
  try {
    assert.ok(await waitFor(() => loop.tickStatus().committedTick > c1), '重开后应从 c1 继续推进');
    assert.equal(loop.snapshot().agents.length, 2, '重开不得重复 spawn');
  } finally {
    await control.stop({ wait: true });
  }
});

// ---- 自动保存边界 ----

test('自动保存：只在提交边界触发、按间隔节流、停止时补存一次', async () => {
  fresh();
  const calls = [];
  metronome.setAutosaveHook((info) => {
    const t = loop.tickStatus();
    calls.push({ ...info, inFlightAtCall: t.inFlight, tickAtCall: t.tick });
    return true;
  });
  metronome.configure({ autosaveEveryTicks: 3 });

  control.start({ agentCount: 2, background: true, msPerTick: 0 });
  assert.ok(await waitFor(() => metronome.status().ticksRun >= 6, 10000), '应至少跑 6 个 tick');
  await control.stop({ wait: true });

  assert.ok(calls.length >= 3, '应有周期保存 + 停止补存，实际 ' + calls.length);
  for (const c of calls) {
    assert.equal(c.inFlightAtCall, false, '自动保存绝不能在半提交态执行（reason=' + c.reason + '）');
    assert.equal(c.tickAtCall, c.committedTick, '自动保存必须发生在提交边界');
  }
  const periodic = calls.filter((c) => c.reason === 'periodic');
  assert.ok(periodic.length >= 2, '应至少发生两次周期保存，实际 ' + periodic.length);
  for (const c of periodic) {
    assert.equal(c.committedTick % 3, 0, '周期保存应落在 everyTicks 整数倍，实际 tick=' + c.committedTick);
  }
  const stopSaves = calls.filter((c) => c.reason === 'stop');
  assert.equal(stopSaves.length, 1, '停止时应补存一次');
  assert.equal(metronome.status().autosave.count, calls.length);
  assert.equal(metronome.status().autosave.lastError, null);
});

test('自动保存边界：半提交态拒绝保存（与 t2 提交边界同源）', async () => {
  fresh();
  loop.spawnAgent({ name: '甲' });
  let saved = 0;
  metronome.setAutosaveHook(() => { saved += 1; return true; });

  const pending = loop.step({ eventProbability: 0 });
  assert.equal(loop.tickStatus().inFlight, true, 'tick 应已进入进行中');
  assert.equal(await metronome.autosave('manual'), null, '半提交态必须拒绝保存');
  assert.equal(saved, 0, '半提交态不得调用保存钩子');

  await pending;
  assert.equal(await metronome.autosave('manual'), true, '提交边界上应能保存');
  assert.equal(saved, 1);
});

test('自动保存：失败不杀死世界，但记录在案（不静默）', async () => {
  fresh();
  metronome.setAutosaveHook(() => { throw new Error('disk full'); });
  metronome.configure({ autosaveEveryTicks: 2 });
  control.start({ agentCount: 2, background: true, msPerTick: 0 });
  try {
    assert.ok(await waitFor(() => metronome.status().autosave.lastError === 'disk full', 10000),
      '保存失败必须成为可查询的事实');
    const st = metronome.status();
    assert.equal(st.active, true, '保存失败不得停掉挂机');
    assert.ok(st.ticksRun >= 2, '保存失败后世界必须继续推进');
    assert.equal(st.autosave.count, 0, '失败不计入成功次数');
    assert.equal(st.autosave.lastReason, 'periodic');
  } finally {
    await control.stop({ wait: true });
  }
});

// ---- 不伪装：默认不启动后台 ----

test('默认不启动后台：start() 不带 background 时不产生任何后台推进器', async () => {
  fresh();
  control.start({ agentCount: 2 });
  assert.equal(metronome.status().active, false, '默认不得启动节拍器');
  assert.equal(stageProgress.hasBackgroundDriver(), false);

  const s = observerApi.simStatus();
  assert.equal(s.background, false);
  assert.equal(s.driver, 'manual-step');
  assert.equal(s.state, 'ready', 't16 契约：phase=running 但没有后台推进器时必须报 ready');
  assert.equal(s.stateReason, 'no_background_driver');
  assert.equal(s.stopping, false);

  await sleep(150);
  assert.equal(loop.tickStatus().committedTick, 0, '没有后台推进器时不得有任何 tick 偷偷前进');
});

test('__reset 强制停掉节拍器（防止后台 timer 跨用例泄漏）', async () => {
  fresh();
  control.start({ agentCount: 2, background: true, msPerTick: 20 });
  assert.ok(await waitFor(() => metronome.status().ticksRun >= 1));
  control.__reset();
  assert.equal(metronome.status().active, false);
  assert.equal(stageProgress.hasBackgroundDriver(), false);
  // __reset 明确**不等待**在飞的 tick（它的契约是"立刻注销驱动器"，不是产品停止路径），
  // 因此已开始的那一个 tick 仍可能补跑完并提交一次。真正要保证的是：
  // settle 之后完全静止 —— 不再有任何**新**的 tick 被启动。
  await sleep(80);
  const c = loop.tickStatus().committedTick;
  await sleep(200);
  assert.equal(loop.tickStatus().committedTick, c, '复位后不得再有新的后台 tick 前进');
  assert.equal(stageProgress.hasBackgroundDriver(), false);
});

// ---- 控制面（HTTP 层同源） ----

test('控制面：pacing 与观测 API 同源；倍速档位与非法参数分别 404 / 400', async () => {
  fresh();
  control.start({ agentCount: 2, background: true, msPerTick: 500, speed: 5 });
  try {
    const cp = control.getPacing();
    const s = observerApi.simStatus();
    assert.equal(cp.effectiveMsPerTick, 100, '500/5 = 100ms/tick');
    assert.equal(s.pacing.effectiveMsPerTick, 100, '观测 API 必须与控制面同源');
    assert.equal(s.pacing.msPerTick, 500);
    assert.equal(s.pacing.speed, 5);
    assert.equal(s.pacing.msPerTickSource, 'configured');
    assert.equal(s.background, true);
    assert.equal(cp.metronome.active, true);
  } finally {
    await control.stop({ wait: true });
  }
  // 停止不重置节拍配置（重开沿用），但不再声称有后台
  const s2 = observerApi.simStatus();
  assert.equal(s2.pacing.msPerTick, 500);
  assert.equal(s2.background, false);

  assert.equal(control.setPacing({ preset: 'quick' }).speed, 10);
  assert.throws(() => control.setPacing({ preset: 'nope' }), (e) => e.status === 404);
  assert.throws(() => control.setPacing({ speed: -1 }), (e) => e.status === 400);
  assert.throws(() => control.setPacing({ msPerTick: -5 }), (e) => e.status === 400);
});

// ---------------------------------------------------------------------------
// HTTP 路由表面
//
// 这一组用例存在的理由是一次**真实事故**：路由「写在路由表里」不等于
// 「注册到了服务上」。观测端点曾经只导出 2 条路由，而 sim/status、sim/stages、
// sim/persistence… 全都只在模块里定义、没进 routes —— 直接调用函数一切正常，
// 走 HTTP 却全是 404。函数级单测永远发现不了这类断线。
// 因此凡新增对外端点，必须有一条**走真实 HTTP**的用例。
// ---------------------------------------------------------------------------

/** 起一个真实服务跑 fn(base)，结束后一定关掉。 */
async function withServer(fn) {
  const { server, port } = await api.start(0);
  try {
    return await fn('http://127.0.0.1:' + port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('HTTP：挂机控制面路由真的可达（pacing / pause / resume / stop）', async () => {
  fresh();
  await withServer(async (base) => {
    const post = (path, body) => fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const json = async (path) => (await fetch(base + path)).json();

    // GET /sim/pacing：默认 37.5 秒/tick 必须能从 HTTP 读到
    const p0 = await json('/api/v1/sim/pacing');
    assert.equal(p0.msPerTick, 37500);
    assert.equal(p0.msPerTickSource, 'default');
    assert.equal(p0.speed, 1);

    // POST /sim/pacing：未知档位 404、非法参数 400（而不是 500）
    assert.equal((await post('/api/v1/sim/pacing', { preset: 'quick' })).status, 200);
    assert.equal((await post('/api/v1/sim/pacing', { preset: 'nope' })).status, 404);
    assert.equal((await post('/api/v1/sim/pacing', { speed: -1 })).status, 400);

    // POST /sim/start {background:true}：HTTP 上真的开起后台推进器并推进世界
    assert.equal((await post('/api/v1/sim/start', { agentCount: 2, background: true, msPerTick: 25 })).status, 200);
    assert.ok(await waitFor(() => loop.tickStatus().committedTick >= 1), 'HTTP 启动的节拍器应真的推进世界');
    const s1 = await json('/api/v1/sim/status');
    assert.equal(s1.background, true);
    assert.equal(s1.driver, 'metronome');
    assert.ok(s1.state === 'running' || s1.state === 'advancing', '实际 ' + s1.state);

    // POST /sim/pause → POST /sim/resume
    assert.equal((await post('/api/v1/sim/pause')).status, 200);
    assert.equal(control.currentPhase(), 'paused');
    // 暂停不打断在飞的 tick，所以要等它跑完再断言"暂停态"（否则会偶发读到 advancing）
    assert.ok(await waitFor(() => loop.tickStatus().inFlight === false), '暂停后当前 tick 应跑完');
    assert.equal((await json('/api/v1/sim/status')).state, 'paused');
    assert.equal((await post('/api/v1/sim/resume')).status, 200);
    assert.equal(control.currentPhase(), 'running');

    // POST /sim/stop {wait:true}：跑完当前 tick，停在提交边界
    assert.equal((await post('/api/v1/sim/stop', { wait: true })).status, 200);
    const t = loop.tickStatus();
    assert.equal(t.inFlight, false, 'stop 返回时不得仍有 tick 在飞');
    assert.equal(t.tick, t.committedTick, '必须停在提交边界');
    const s2 = await json('/api/v1/sim/status');
    assert.equal(s2.state, 'stopped');
    assert.equal(s2.stateReason, 'operator_stopped');
    assert.equal(s2.driver, 'none');
    assert.equal(s2.background, false);

    // 未注册路径仍是 404：确认 404 来自路由表，而不是被某个兜底 handler 吞掉
    assert.equal((await fetch(base + '/api/v1/sim/definitely-not-a-route')).status, 404);
  });
});

test('HTTP：观测面 7 个 sim 端点 + decisions 路由真的注册且可达', async () => {
  fresh();
  // 先看路由表：这是"注册"的直接证据（曾经 status/stages/... 只定义未注册）。
  const table = api.routes().map((r) => r.method + ' ' + r.path);
  const required = [
    'GET /api/v1/sim/status',
    'GET /api/v1/sim/stages',
    'GET /api/v1/sim/stream',
    'GET /api/v1/sim/decisions',
    'GET /api/v1/sim/persistence',
    'POST /api/v1/sim/save',
    'POST /api/v1/sim/restore',
    'GET /api/v1/decisions/:decision_id',
  ];
  for (const r of required) {
    assert.ok(table.includes(r), '路由未注册到服务上：' + r);
  }

  // 再走真实 HTTP：路由表里有、但处理器抛错/路径写错，同样要能发现。
  await withServer(async (base) => {
    control.start({ agentCount: 2 });
    await control.step({ eventProbability: 0 });
    const post = (path) => fetch(base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });

    assert.equal((await fetch(base + '/api/v1/sim/status')).status, 200);
    assert.equal((await fetch(base + '/api/v1/sim/stages')).status, 200);
    assert.equal((await fetch(base + '/api/v1/sim/decisions')).status, 200);
    assert.equal((await fetch(base + '/api/v1/sim/persistence')).status, 200);
    // stream 是 SSE：maxEvents=1 让它推完 status+done 后自己结束，不会挂住用例
    assert.equal((await fetch(base + '/api/v1/sim/stream?maxEvents=1')).status, 200);
    assert.equal((await post('/api/v1/sim/save')).status, 200);
    assert.equal((await post('/api/v1/sim/restore')).status, 200);

    // 写端点必须**只按 POST 注册**：GET 应当落到 404，而不是被宽松匹配接住
    assert.equal((await fetch(base + '/api/v1/sim/save')).status, 404, 'save 不应响应 GET');
    assert.equal((await fetch(base + '/api/v1/sim/restore')).status, 404, 'restore 不应响应 GET');
  });
});

// ---------------------------------------------------------------------------
// 恢复边界（t25）：存档/恢复不得让观测 API 谎报后台驱动器
//
// t16 的契约是「恢复后 recent 必须为空」；t25 补上后半句：
// 「但 backgroundDriver 是**当下事实**，不能跟着一起忘掉」。
// 两者若只做前者，节拍器仍在运行时恢复就会把 driver 谎报成 manual-step ——
// 这正是 t16 明文要禁止的"用标签伪装真相"。
// ---------------------------------------------------------------------------

test('恢复边界：存档/恢复清空阶段历史，但后台驱动器事实必须保留（不得谎报 manual-step）', async () => {
  fresh();
  control.start({ agentCount: 2, background: true, msPerTick: 40 });
  try {
    assert.ok(await waitFor(() => loop.tickStatus().committedTick >= 1), '前置条件：应有已提交 tick');
  } finally {
    // 先停表，让存档落在提交边界上（推进中不允许存档，这是 t16 的 409 门）。
    await control.stop({ wait: true });
  }
  assert.equal(stageProgress.hasBackgroundDriver(), false, '停表后驱动器事实应为 false');

  // 手工把驱动器事实设为 true，模拟"恢复时节拍器仍在运行"的世界。
  stageProgress.setBackgroundDriver(true);
  stageProgress.begin(99);
  stageProgress.unit('regen', null);
  assert.notEqual(stageProgress.current(), null, '前置条件：应有进行中的 tick');

  const saved = observerApi.saveRun({ reason: 't25-boundary' });
  assert.equal(saved.ok, true);
  const snap = observerApi.persistenceStatus().slot;
  assert.notEqual(snap, null, '应有可用存档槽');

  observerApi.restoreRun({});
  const s = observerApi.simStatus();
  const st = observerApi.stages(3);

  // 契约 1：观测历史不得跨恢复泄漏（t16）。
  assert.equal(st.recent.length, 0, '恢复后 recent 必须为空');
  assert.equal(st.current, null, '恢复后不得残留进行中的 tick');
  // 契约 2：驱动器事实保留 —— 观测 API 不得把"有后台"谎报成 manual-step。
  assert.equal(stageProgress.hasBackgroundDriver(), true, 'backgroundDriver 必须随存档恢复');
  assert.equal(s.background, true, 'background 必须如实反映驱动器事实');
  assert.equal(s.driver, 'metronome', 'driver 必须报 metronome，而不是 manual-step');
  assert.notEqual(s.driver, 'manual-step', '这正是 t16 禁止的谎报');

  // 收尾：把驱动器事实还原，避免影响其它用例（本进程是共享模块状态）。
  stageProgress.setBackgroundDriver(false);
  observerApi.__reset();
});
