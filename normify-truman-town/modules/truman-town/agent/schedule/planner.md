---
uid: a240933a
id: truman-town.agent.schedule.planner
parent: truman-town.agent.schedule
state: planned
name: {zh: "日程规划", en: "Schedule Planner"}
description:
  zh: >
      根据角色、目标与约束生成和重排日程。
  en: >
      Generates and replans schedules from roles, goals and constraints.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent.schedule.planner.generate"
    description:
      zh: >
          调用 agent.schedule.planner.generate。
      en: >
          Calls agent.schedule.planner.generate.
  - protocol: rpc
    path: "agent.schedule.planner.replan"
    description:
      zh: >
          调用 agent.schedule.planner.replan。
      en: >
          Calls agent.schedule.planner.replan.
deps:
  - kind: call
    to: truman-town.agent.persona.motivation
  - kind: call
    to: truman-town.ai.prompt.agent
  - kind: call
    to: truman-town.survival.goal
---
