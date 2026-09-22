---
uid: 91f77805
id: truman-town.agent.anticipation.pool.pruner
parent: truman-town.agent.anticipation.pool
state: planned
name: {zh: "候选修剪器", en: "Candidate Pruner"}
description:
  zh: >
      按时间与可行性修剪过期候选。
  en: >
      Prunes stale or infeasible candidates by time and viability.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:27:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent.anticipation.pool.pruner.prune"
    description:
      zh: >
          调用 agent.anticipation.pool.pruner.prune。
      en: >
          Calls agent.anticipation.pool.pruner.prune.
  - protocol: rpc
    path: "agent.anticipation.pool.pruner.stale"
    description:
      zh: >
          调用 agent.anticipation.pool.pruner.stale。
      en: >
          Calls agent.anticipation.pool.pruner.stale.
deps:
  - kind: call
    to: truman-town.agent.anticipation.pool.store
  - kind: call
    to: truman-town.runtime.clock
---
