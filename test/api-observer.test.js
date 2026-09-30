import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../src/api/index.js';
import * as control from '../src/api/control.js';
import * as observerApi from '../src/api/observer.js';
import * as loop from '../src/runtime/orchestrator/loop.js';
import * as stageProgress from '../src/runtime/orchestrator/stage-progress.js';

/**
 * 观测 API、阶段流与产品状态一致性（t16）。
 *
 * 本文件锁定的核心契约只有一条：
 *   **API 不得用 running 标签伪装真实后台运行。**
 * 当前架构里没有任何后台循环，tick 只会在显式 step 时前进。因此：
 *   - `phase` 表达操作者意图（可以就是 'running'）；
 *   - `advancing` / `background` / `driver` 表达**实际**是否有人在推进。
 * 只断言 phase 而不断言这三者，正是旧实现"看起来在跑其实没跑"的成因。
 */

function fresh() {
  loop.reset();
  control.__reset();
  observerApi.__reset();
}

async function withServer(fn) {
  const { server, port } = await api.start(0);
  try {
    return await fn('http://127.0.0.1:' + port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/** 读取 SSE 流直到 done（或连接结束），返回 { contentType, events }。 */
async function readStream(url) {
  const res = await fetch(url);
  const contentType = res.headers.get('content-type');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.includes('event: done')) break;
  }
  const events = text.split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block !== '' && block.startsWith('event:'))
    .map((block) => {
      const nameLine = block.split('\n').find((l) => l.startsWith('event: '));
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
      return {
        event: nameLine.slice('event: '.length),
        data: dataLine === undefined ? null : JSON.parse(dataLine.slice('data: '.length)),
      };
    });
  return { contentType, events };
}

// ---------------------------------------------------------------------------
// 运行态：不伪装后台运行
// ---------------------------------------------------------------------------

test('sim/status: 未启动时为 idle，且不声称在推进', () => {
  fresh();
  const s = observerApi.simStatus();
  assert.equal(s.phase, 'idle');
  assert.equal(s.state, 'idle');
  assert.equal(s.stateReason, 'not_started');
  assert.equal(s.advancing, false);
  assert.equal(s.background, false);
  assert.equal(s.driver, 'none');
  assert.equal(s.tick, 0);
  assert.equal(s.committedTick, 0);
});

test('sim/status: start 后 phase=running 但 state=ready，明确没有后台推进器', () => {
  fresh();
  control.start({});
  const s = observerApi.simStatus();
  // 操作者意图确实是 running……
  assert.equal(s.phase, 'running');
  // ……但 API 不得把"意图"当成"事实"：没有任何后台循环在推进 tick。
  assert.equal(s.state, 'ready');
  assert.equal(s.stateReason, 'no_background_driver');
  assert.equal(s.background, false);
  assert.equal(s.driver, 'manual-step');
  assert.equal(s.advancing, false);
  assert.equal(s.tick, 0, 'start 本身不得推进 tick');
  assert.equal(typeof s.stateDescription, 'string');
});

test('sim/status: step 后提交边界闭合，committedTick 与 tick 一致', async () => {
  fresh();
  control.start({ agentCount: 3 });
  const res = await control.step({ eventProbability: 0 });
  assert.equal(res.committedTick, 1);
  const s = observerApi.simStatus();
  assert.equal(s.tick, 1);
  assert.equal(s.committedTick, 1);
  assert.equal(s.inFlight, false);
  assert.equal(s.advancing, false);
  assert.equal(s.lastFailure, null);
  assert.ok(s.lastCommit !== null);
  assert.equal(s.lastCommit.tick, 1);
  assert.ok(Number.isFinite(s.lastCommit.ms));
});

test('sim/status: 推进中可被观测到（advancing=true 且带当前阶段）', async () => {
  fresh();
  control.start({ agentCount: 30 });
  const stepP = control.step({ eventProbability: 0 });
  const samples = [];
  for (let i = 0; i < 500; i += 1) {
    const s = observerApi.simStatus();
    if (s.advancing) samples.push(s);
    await new Promise((resolve) => setImmediate(resolve));
    if (samples.length > 0 && observerApi.simStatus().advancing === false) break;
  }
  await stepP;
  assert.ok(samples.length >= 1, '推进中必须可被观测到（否则"推进中"无法展示）');
  assert.equal(samples[0].state, 'advancing');
  assert.equal(samples[0].stateReason, 'tick_in_flight');
  assert.ok(samples[0].stage !== null, '推进中应能看到当前阶段');
  assert.equal(typeof samples[0].stage.id, 'string');
});

test('sim/status: 失败后 state=failed 并给出失败阶段线索；恢复后不再粘住', async () => {
  fresh();
  control.start({ agentCount: 3 });
  // decay=null 会让 survival 阶段抛错，用于确定性地制造一次 tick 失败。
  await assert.rejects(() => control.step({ decay: null }));
  const failed = observerApi.simStatus();
  assert.equal(failed.state, 'failed');
  assert.equal(failed.stateReason, 'last_tick_failed');
  assert.ok(failed.lastFailure !== null);
  assert.equal(failed.lastFailure.latest, true);
  assert.match(String(failed.lastFailure.message), /food/);
  assert.equal(failed.lastFailure.afterStage, 'regen', '应指出失败发生在哪个阶段之后');
  assert.equal(failed.committedTick, 0, '失败的 tick 不得被算作已提交');

  // 失败历史进入阶段时间线，事后仍可观察。
  const st = observerApi.stages(5);
  assert.equal(st.recent[st.recent.length - 1].status, 'failed');
  assert.equal(st.recent[st.recent.length - 1].afterStage, 'regen');

  // 一次成功 tick 之后，现状必须是 ready 而不是永远 failed。
  await control.step({ eventProbability: 0 });
  const recovered = observerApi.simStatus();
  assert.equal(recovered.state, 'ready');
  // 失败的 tick 已经消耗了时钟号（tick=1），但从未提交（committedTick 仍是 0）；
  // 下一次成功是 tick=2 / committedTick=2。中间那一号是**有记录的空洞**——
  // 由阶段时间线里的 failed 条目解释，而不是被悄悄抹平。
  assert.equal(recovered.tick, 2);
  assert.equal(recovered.committedTick, 2);
  assert.equal(recovered.lastFailure.latest, false, '失败转为历史，但不得消失');
});

test('sim/status: 暂停时 state=paused（且与 failed 区分）', () => {
  fresh();
  control.start({});
  control.pause();
  const s = observerApi.simStatus();
  assert.equal(s.phase, 'paused');
  assert.equal(s.state, 'paused');
  assert.equal(s.stateReason, 'operator_paused');
});

// ---------------------------------------------------------------------------
// 阶段流
// ---------------------------------------------------------------------------

test('sim/stages: 当前阶段与最近 tick 的阶段时间线可读', async () => {
  fresh();
  control.start({ agentCount: 3 });
  await control.step({ eventProbability: 0 });
  const st = observerApi.stages(2);
  assert.equal(st.committedTick, 1);
  assert.equal(st.inFlight, false);
  assert.equal(st.recent.length, 1);
  const rec = st.recent[0];
  assert.equal(rec.tick, 1);
  assert.equal(rec.status, 'committed');
  assert.ok(rec.totalMs >= 0);
  const ids = rec.stages.map((s) => s.id);
  assert.ok(ids.includes('regen'));
  assert.ok(ids.includes('survival'));
  assert.ok(ids.includes('done'));
  // 逐居民单元聚合成一条（3 个居民 → decide count=3），否则长跑下条目数会爆炸。
  const decide = rec.stages.find((s) => s.id === 'decide');
  assert.equal(decide.count, 3);
  assert.equal(decide.detail.of, 3);
});

test('sim/stages: limit 有界，且不得超过环形缓冲上限', async () => {
  fresh();
  control.start({ agentCount: 2 });
  await control.step({ eventProbability: 0 });
  assert.ok(observerApi.stages(1).recent.length <= 1);
  assert.ok(observerApi.stages(9999).recent.length <= stageProgress.MAX_RECENT_TICKS);
});

test('sim/stream: SSE 推送 status/progress/done，并在 maxEvents 后自行结束', async () => {
  fresh();
  control.start({ agentCount: 3 });
  await withServer(async (base) => {
    const { contentType, events } = await readStream(base + '/api/v1/sim/stream?intervalMs=50&maxEvents=3');
    assert.match(String(contentType), /text\/event-stream/);
    assert.equal(events[0].event, 'status');
    assert.equal(events[0].data.phase, 'running');
    // 首帧就必须诚实地说明没有后台推进器。
    assert.equal(events[0].data.background, false);
    assert.equal(events[0].data.driver, 'manual-step');
    assert.ok(events.some((e) => e.event === 'progress'));
    assert.equal(events[events.length - 1].event, 'done');
    assert.equal(events[events.length - 1].data.events, 3);
  });
});

test('sim/stream: 推进中时 progress 帧能带上当前阶段', async () => {
  fresh();
  control.start({ agentCount: 20 });
  await withServer(async (base) => {
    // 直接驱动 tickSequence 并**放慢**每一次推进，把 tick 拉长到远超推送间隔。
    // 这既是确定性的测试手段，也正是挂机节拍器（t8）的用法：
    // 节拍器逐单元拉取、逐单元节流，观察者据此看到"此刻跑到哪一步"。
    const streamP = readStream(base + '/api/v1/sim/stream?intervalMs=50&maxEvents=12');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const driver = (async () => {
      for await (const _unit of loop.tickSequence({ eventProbability: 0 })) {
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    })();
    const { events } = await streamP;
    await driver;
    const advancing = events.filter((e) => e.event === 'progress' && e.data.advancing === true);
    assert.ok(advancing.length >= 1, '阶段流必须能展示"推进中"');
    assert.ok(
      advancing.some((e) => e.data.stageDetail !== null && typeof e.data.stageDetail.tick === 'number'),
      '推进中的帧必须带当前 tick 的阶段明细',
    );
    // 流结束后回到已提交状态，证明"推进中"不是被永久标上的标签。
    const after = observerApi.simStatus();
    assert.equal(after.advancing, false);
    assert.equal(after.committedTick, 1);
  });
});

// ---------------------------------------------------------------------------
// tick 采样帧：采样由「已提交 tick」驱动，不由客户端刷新驱动
// ---------------------------------------------------------------------------

test('sim/stream: 每个已提交 tick 推一帧 sample，且同一 tick 不重复推', async () => {
  fresh();
  control.start({ agentCount: 3 });
  await withServer(async (base) => {
    // 未推进任何 tick 时不应有 sample：0 号 tick 不是"完成了一个 tick"。
    const idle = await readStream(base + '/api/v1/sim/stream?intervalMs=50&maxEvents=4');
    assert.equal(
      idle.events.filter((e) => e.event === 'sample').length, 0,
      '还没提交过 tick 就不该推 sample',
    );

    await control.step({ eventProbability: 0 });
    // 流要跑足够多帧，才能证明"同一 tick 只推一次"而不是"碰巧只跑了一帧"。
    const { events } = await readStream(base + '/api/v1/sim/stream?intervalMs=50&maxEvents=10');
    const samples = events.filter((e) => e.event === 'sample');
    assert.equal(samples.length, 1, 'committedTick 未变时必须只推一帧 sample，实际 ' + samples.length);
    assert.equal(samples[0].data.tick, 1);

    const s = samples[0].data;
    for (const key of ['food', 'water', 'energy', 'medical']) {
      assert.equal(typeof s.resources[key], 'number', '资源快照必须是可画的数值：' + key);
    }
    assert.equal(typeof s.needs.min, 'number');
    assert.equal(typeof s.needs.max, 'number');
    assert.equal(typeof s.needs.avg, 'number');
    assert.equal(typeof s.latency.count, 'number');
    assert.equal(s.population, 3);
    assert.equal(s.alive, 3);
    assert.equal(s.missed, 0, '没有跳号时缺口应为 0');
  });
});

test('sim/stream: 连接时已有进度则补一帧当前 tick 的 sample', async () => {
  fresh();
  control.start({ agentCount: 2 });
  await control.step({ eventProbability: 0 });
  await control.step({ eventProbability: 0 });
  await withServer(async (base) => {
    const { events } = await readStream(base + '/api/v1/sim/stream?intervalMs=50&maxEvents=6');
    const samples = events.filter((e) => e.event === 'sample');
    assert.equal(samples.length, 1, '中途接入应立刻拿到一帧当前 tick 作为图表基准');
    assert.equal(samples[0].data.tick, 2);
  });
});

test('sim/stream: sample 帧计入 maxEvents 预算，done 仍是最后一帧', async () => {
  fresh();
  control.start({ agentCount: 2 });
  await control.step({ eventProbability: 0 });
  await withServer(async (base) => {
    // 2 是关键边界：此时 status 之后预算只剩 1 格，sample 必须让位给 done，
    // 否则会多推一帧、越过 maxEvents。3/5/8 覆盖常规情形。
    for (const maxEvents of [2, 3, 5, 8]) {
      const { events } = await readStream(base + `/api/v1/sim/stream?intervalMs=50&maxEvents=${maxEvents}`);
      assert.equal(
        events.length, maxEvents,
        `maxEvents=${maxEvents} 时不得多推帧，实际 ${events.length}`,
      );
      assert.equal(events[events.length - 1].event, 'done');
    }
  });
});

// ---------------------------------------------------------------------------
// 决策链：意图 → 最终行动 → 执行结果
// ---------------------------------------------------------------------------

test('sim/decisions: 每条决策同时给出意图、最终行动与执行结果', async () => {
  fresh();
  control.start({ agentCount: 3 });
  await control.step({ eventProbability: 0 });
  const list = observerApi.recentDecisions(5, 1);
  assert.equal(list.length, 3);
  for (const d of list) {
    assert.equal(typeof d.decisionId, 'string');
    assert.equal(d.tick, 1);
    assert.ok(d.intent !== null && typeof d.intent.action === 'string', '意图必须可见');
    assert.ok(d.final !== null && typeof d.final.action === 'string', '最终行动必须可见');
    assert.ok(d.execution !== null, '执行结果必须可见');
    assert.ok(typeof d.execution.outcome.status === 'string');
    // 模型未生效时必须显式给出回退原因，而不是假装模型参与了决策。
    assert.equal(d.model.applied, false);
    assert.equal(d.model.fallbackReason, 'llm_decide_disabled');
  }
});

test('decisions/:id: 完整链路 + 同一 ID 跨 tick 出现时的歧义说明', async () => {
  fresh();
  control.start({ agentCount: 1 });
  await control.step({ eventProbability: 0 });
  await control.step({ eventProbability: 0 });
  const [first] = observerApi.recentDecisions(1, 1);
  // 同一居民连续两 tick 选同一动作 → decisionId 相同（ID = 居民 + 动作）。
  const ambiguous = observerApi.decisionTrace(first.decisionId);
  assert.equal(ambiguous.decisionId, first.decisionId);
  assert.equal(ambiguous.ambiguous, true);
  assert.ok(ambiguous.occurrences >= 2);
  assert.equal(typeof ambiguous.hint, 'string');
  // 带 tick 即可精确定位，且不再歧义。
  const exact = observerApi.decisionTrace(first.decisionId, 1);
  assert.equal(exact.tick, 1);
  assert.equal(exact.ambiguous, false);
  assert.equal(exact.occurrences, 1);
});

test('decisions/:id: 不存在的决策抛 404', () => {
  fresh();
  assert.throws(() => observerApi.decisionTrace('agent_none:noop'), (e) => e.status === 404);
  assert.throws(() => observerApi.decisionTrace(''), (e) => e.status === 400);
});

// ---------------------------------------------------------------------------
// 存档状态
// ---------------------------------------------------------------------------

test('sim/persistence: 能力与最近一次保存/恢复状态可读', async () => {
  fresh();
  control.start({ agentCount: 3 });
  await control.step({ eventProbability: 0 });
  const before = observerApi.persistenceStatus();
  assert.equal(before.available, true);
  assert.ok(before.coreCount > 0);
  assert.ok(Array.isArray(before.sections) && before.sections.length === before.coreCount + before.sections.filter((s) => s.kind !== 'core').length);
  assert.ok(before.sections.every((s) => typeof s.hasSnapshot === 'boolean' && typeof s.hasRestore === 'boolean'));
  assert.equal(before.lastSave, null, '未保存前必须如实报 null');
  assert.equal(before.lastRestore, null);
  assert.equal(before.slot, null);

  const saved = observerApi.saveRun({ reason: 'test' });
  assert.equal(saved.ok, true);
  assert.equal(saved.save.tick, 1);
  assert.ok(saved.save.records > 0);
  assert.ok(saved.save.sections > 0);

  const mid = observerApi.persistenceStatus();
  assert.equal(mid.lastSave.tick, 1);
  assert.ok(mid.slot !== null && mid.slot.records > 0);

  const restored = observerApi.restoreRun({});
  assert.equal(restored.ok, true);
  assert.equal(restored.restore.committedTick, 1);
  const after = observerApi.persistenceStatus();
  assert.ok(after.lastRestore !== null);
  assert.equal(after.lastRestore.tick, 1);
});

test('sim/save|restore: 拒绝在 tick 推进中操作（半提交态不可存档）', async () => {
  fresh();
  control.start({ agentCount: 30 });
  const stepP = control.step({ eventProbability: 0 });
  // 同步调用：此刻 tick 已在推进中（inFlight=true），存档必须是"一半旧一半新"之外的东西。
  assert.throws(() => observerApi.saveRun({}), (e) => e.status === 409);
  assert.throws(() => observerApi.restoreRun({}), (e) => e.status === 409);
  await stepP;
  // 提交完成后即可正常保存。
  assert.equal(observerApi.saveRun({}).ok, true);
});

test('sim/restore: 恢复后提交边界对齐到存档的 tick', async () => {
  fresh();
  control.start({ agentCount: 3 });
  await control.step({ eventProbability: 0 });
  await control.step({ eventProbability: 0 });
  observerApi.saveRun({});
  await control.step({ eventProbability: 0 });
  assert.equal(observerApi.simStatus().committedTick, 3);
  observerApi.restoreRun({});
  const s = observerApi.simStatus();
  assert.equal(s.tick, 2, '恢复后时钟回到存档 tick');
  assert.equal(s.committedTick, 2, 'committedTick 必须跟上恢复后的时钟');
  assert.equal(s.inFlight, false);
  assert.equal(s.advancing, false);
  assert.equal(observerApi.stages(3).recent.length, 0, '旧进程的阶段记录不得跨恢复泄漏');
});

test('sim/restore: 没有存档时明确报错，而不是假装恢复成功', () => {
  fresh();
  assert.throws(() => observerApi.restoreRun({}), (e) => e.status === 409);
});

test('sim/persistence: 非法存档被拒绝（缺少 core section）', () => {
  fresh();
  assert.throws(
    () => observerApi.restoreRun({ snapshot: { schemaVersion: 2, records: [], sections: {} } }),
    (e) => e.status === 400,
  );
});

// ---------------------------------------------------------------------------
// HTTP 表面
// ---------------------------------------------------------------------------

test('http: 观测端点在真实服务上可用（status/stages/decisions/persistence）', async () => {
  fresh();
  control.start({ agentCount: 3 });
  await withServer(async (base) => {
    await fetch(base + '/api/v1/sim/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventProbability: 0 }),
    });

    const status = await (await fetch(base + '/api/v1/sim/status')).json();
    assert.equal(status.phase, 'running');
    assert.equal(status.state, 'ready');
    assert.equal(status.background, false);
    assert.equal(status.committedTick, 1);

    const stages = await (await fetch(base + '/api/v1/sim/stages?limit=2')).json();
    assert.equal(stages.recent.length, 1);
    assert.equal(stages.recent[0].tick, 1);

    const decisions = await (await fetch(base + '/api/v1/sim/decisions?limit=2')).json();
    assert.equal(decisions.length, 2);
    const id = decisions[0].decisionId;
    const trace = await (await fetch(base + '/api/v1/decisions/' + encodeURIComponent(id) + '?tick=' + decisions[0].tick)).json();
    assert.equal(trace.decisionId, id);
    assert.ok(trace.execution !== null);

    const missing = await fetch(base + '/api/v1/decisions/' + encodeURIComponent('agent_x:noop'));
    assert.equal(missing.status, 404);

    const persist = await (await fetch(base + '/api/v1/sim/persistence')).json();
    assert.equal(persist.available, true);

    const save = await fetch(base + '/api/v1/sim/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'http-test' }),
    });
    assert.equal(save.status, 200);
    assert.equal((await save.json()).ok, true);

    const restore = await fetch(base + '/api/v1/sim/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(restore.status, 200);
    assert.equal((await restore.json()).ok, true);
  });
});

// ---------------------------------------------------------------------------
// 阶段进度模块本身的边界
// ---------------------------------------------------------------------------

test('stage-progress: 复位后无残留，begin/unit/commit 语义正确', () => {
  stageProgress.__reset();
  assert.deepEqual(stageProgress.summary().current, null);
  assert.equal(stageProgress.summary().lastCommit, null);
  assert.equal(stageProgress.hasBackgroundDriver(), false);

  stageProgress.begin(7);
  stageProgress.unit('a', { n: 1 });
  stageProgress.unit('a', { n: 2 });
  stageProgress.unit('b', null);
  const cur = stageProgress.current();
  assert.equal(cur.tick, 7);
  assert.equal(cur.units, 3);
  assert.equal(cur.stages.length, 2, '相邻同 id 单元必须聚合');
  assert.equal(cur.stages[0].count, 2);
  assert.equal(cur.stage.id, 'b');

  stageProgress.commit(7);
  assert.equal(stageProgress.current(), null);
  assert.equal(stageProgress.lastCommitted().tick, 7);
  assert.equal(stageProgress.lastFailure(), null);

  stageProgress.setBackgroundDriver(true);
  assert.equal(stageProgress.hasBackgroundDriver(), true);
  stageProgress.__reset();
  assert.equal(stageProgress.hasBackgroundDriver(), false);
});

test('stage-progress: 失败记录保留阶段线索且不随复位以外的方式消失', () => {
  stageProgress.__reset();
  stageProgress.begin(3);
  stageProgress.unit('regen', null);
  stageProgress.unit('survival', null);
  stageProgress.fail(3, new Error('boom'));
  const f = stageProgress.lastFailure();
  assert.equal(f.tick, 3);
  assert.equal(f.status, 'failed');
  assert.equal(f.afterStage, 'survival');
  assert.equal(f.error, 'boom');
  assert.equal(stageProgress.current(), null, '失败后不得继续处于"推进中"');
  stageProgress.__reset();
  assert.equal(stageProgress.lastFailure(), null);
});

test('sim/stages: 恢复边界——历史清空，但后台驱动器事实随恢复保留（t25）', async () => {
  fresh();
  control.start({ agentCount: 2 });
  await control.step({ eventProbability: 0 });
  await control.step({ eventProbability: 0 });
  assert.equal(observerApi.stages(5).recent.length, 2, '前置条件：应有 2 条阶段历史');

  // 模拟"恢复时节拍器仍在运行"：驱动器事实为真，同时存在观测历史与进行中的 tick。
  stageProgress.setBackgroundDriver(true);
  stageProgress.begin(99);
  stageProgress.unit('regen', null);
  const saved = observerApi.saveRun({ reason: 't25-observ' });
  assert.equal(saved.ok, true);

  observerApi.restoreRun({});
  const st = observerApi.stages(5);
  const s = observerApi.simStatus();

  // t16 契约：观测历史不得跨恢复泄漏。
  assert.equal(st.recent.length, 0, '旧进程的阶段记录不得跨恢复泄漏');
  assert.equal(st.current, null);
  assert.equal(s.advancing, false);
  // t25 契约：驱动器事实是当下状态，必须随存档恢复（否则 driver 谎报）。
  assert.equal(s.background, true);
  assert.equal(s.driver, 'metronome');

  // 收尾还原共享模块状态，避免影响其它用例。
  stageProgress.setBackgroundDriver(false);
  observerApi.__reset();
});
