---
uid: 07305cec
id: truman-town-flow.machines.list.agent-schedule-da1a29c5
parent: truman-town-flow.machines.list
name: {zh: "agent.schedule（初始日程 → 已重排）", en: "agent.schedule"}
description:
  zh: >
      无→初始日程：planner.generate({length, occupation, needs})；初始日程→已重排：planner.replan()（紧急需求 / 跨日）。注意：日程只作非危机时的默认倾向；居民保有自决权，可自主选择日程外行动
  en: >
      agent.schedule state machine with 2 transitions
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent-schedule-da1a29c5:t0_无_to_初始日程"
    description:
      zh: >
          planner.generate({length, occupation, needs}) @src/agent/schedule/planner.js
      en: >
          planner.generate({length, occupation, needs})
  - protocol: rpc
    path: "agent-schedule-da1a29c5:t1_初始日程_to_已重排"
    description:
      zh: >
          planner.replan()（紧急需求 / 跨日） @src/agent/schedule/planner.js
      en: >
          planner.replan()（紧急需求 / 跨日）
---
