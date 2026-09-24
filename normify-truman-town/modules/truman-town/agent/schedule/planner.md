---
uid: a240933a
id: truman-town.agent.schedule.planner
parent: truman-town.agent.schedule
name: {zh: "日程规划", en: "Schedule Planner"}
description:
  zh: >
      根据角色、目标与约束生成和重排日程。
      
  en: >
      Generates and replans schedules from roles, goals and constraints.
      
revision: e350da98bb80d56a99c3c70b9cd269a351113026
updated_at: "2026-09-24T03:13:06.630Z"
fingerprint: 0c461c852583855d1fc1d57b0c532661a24ad3e21e16e4d8c81ca7fabda2076f
source:
  - path: "src/agent/schedule/planner.js"
    line: 1
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
