---
uid: e93ed6c0
id: truman-town.agent.schedule.executor
parent: truman-town.agent.schedule
name: {zh: "日程执行", en: "Schedule Executor"}
description:
  zh: >
      按世界时间推进日程项，触发对应行动。
      
  en: >
      Advances schedule items by world time and triggers actions.
      
revision: e350da98bb80d56a99c3c70b9cd269a351113026
updated_at: "2026-09-24T03:13:06.630Z"
fingerprint: 3f6b6c3bc3ec539299841def187b42f2161123f06ab399be924be3f68395e466
source:
  - path: "src/agent/schedule/executor.js"
    line: 1
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
  - kind: call
    to: truman-town.agent.schedule.planner
---
