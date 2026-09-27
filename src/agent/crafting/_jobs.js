/**
 * 内部共享：制作/建造/写书的任务队列（不作为 Normify 模块暴露）。
 *
 * 维护 pending 任务：enqueue 登记一个耗时 job（ticks 为所需 tick 数），
 * advance(n) 递减剩余 tick 并在归零时回调 onComplete(job) 完成。
 * executor / construction / writing 各持有独立队列实例，互不干扰。
 */

export function createJobQueue() {
  let seq = 0;
  /** @type {Map<string, object>} */
  const pending = new Map();

  function enqueue(job) {
    seq += 1;
    const rec = {
      id: 'job_' + seq,
      agentId: job.agentId,
      kind: job.kind,
      recipeId: job.recipeId ?? null,
      ticks: job.ticks,
      remainingTicks: job.ticks,
      startTick: job.startTick ?? 0,
      startedAt: Date.now(),
      payload: structuredClone(job.payload ?? {}),
    };
    pending.set(rec.id, rec);
    return structuredClone(rec);
  }

  function advance(n, onComplete) {
    const done = [];
    for (const [id, job] of [...pending.entries()]) {
      job.remainingTicks -= n;
      if (job.remainingTicks <= 0) {
        pending.delete(id);
        done.push({ job: structuredClone(job), ...(onComplete(job) ?? {}) });
      }
    }
    return done;
  }

  function list() {
    return [...pending.values()].map((j) => structuredClone(j));
  }

  function __reset() {
    seq = 0;
    pending.clear();
  }

  /**
   * 导出队列（含序号与在途任务）。
   *
   * 为什么必须入档：`pending` 是**闭包内**的 Map，不是模块级变量，
   * 任何「扫模块级状态」的盘点都看不见它。而它装着正在进行的制作/建造/写作
   * 任务及其 remainingTicks——不入档则恢复后在途任务凭空消失：
   * 实测续跑后 crafted 计数比连续运行少 1（那次制作永远完不成）。
   */
  function __snapshot() {
    return { seq, pending: [...pending.values()].map((j) => structuredClone(j)) };
  }

  /** 恢复队列（整体替换）。 */
  function __restore(data = {}) {
    if (data === null || typeof data !== 'object') {
      throw new TypeError('jobQueue.__restore: 状态必须为对象');
    }
    seq = Number.isInteger(data.seq) && data.seq >= 0 ? data.seq : 0;
    pending.clear();
    const list = Array.isArray(data.pending) ? data.pending : [];
    for (const job of list) {
      if (typeof job?.id !== 'string' || job.id === '') continue;
      pending.set(job.id, structuredClone(job));
    }
    return { seq, pending: pending.size };
  }

  return { enqueue, advance, list, __reset, __snapshot, __restore };
}
