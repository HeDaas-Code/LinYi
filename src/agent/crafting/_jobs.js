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

  return { enqueue, advance, list, __reset };
}
