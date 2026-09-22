---
uid: e93ed6c0
id: truman-town.agent.schedule.executor
parent: truman-town.agent.schedule
state: planned
name: {zh: "日程执行", en: "Schedule Executor"}
description:
  zh: >
      按世界时间推进日程项，触发对应行动。
  en: >
      Advances schedule items by world time and triggers actions.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent.schedule.executor.start"
    description:
      zh: >
          调用 agent.schedule.executor.start。
      en: >
          Calls agent.schedule.executor.start.
  - protocol: rpc
    path: "agent.schedule.executor.tick"
    description:
      zh: >
          调用 agent.schedule.executor.tick。
      en: >
          Calls agent.schedule.executor.tick.
deps:
  - kind: call
    to: truman-town.agent.anticipation.pool
  - kind: call
    to: truman-town.agent.crafting.workbench
---
