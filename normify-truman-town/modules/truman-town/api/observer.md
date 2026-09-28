---
uid: f75e2d1b
id: truman-town.api.observer
parent: truman-town.api
name: {zh: "观测接口", en: "Observer API"}
description:
  zh: >
      查询世界状态与智能体详情。
      
  en: >
      Queries world state and agent details.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.379Z"
fingerprint: 72ec664f5d4a3a69b78dcbc4e934afb980396b11f406f769b3f6fab3b452eceb
source:
  - path: "src/api/observer.js"
apis:
  - protocol: http
    method: GET
    path: "/api/v1/world/state"
    description:
      zh: >
          获取当前世界状态快照（tick / 资源 / 需求 / 编年计数）。
          
      en: >
          Gets the current world-state snapshot (tick / resources / needs / chronicle counts).
          
  - protocol: http
    method: GET
    path: "/api/v1/agents/{agent_id}"
    description:
      zh: >
          获取智能体详情（实体信息 + 需求 + 最近决策/行为日志）。
          
      en: >
          Gets agent details (entity info + needs + recent decision/action logs).
          
deps:
  - kind: call
    to: truman-town.runtime.world-state
  - kind: call
    to: truman-town.runtime.registry
  - kind: call
    to: truman-town.observer.recorder.decision-log
  - kind: call
    to: truman-town.observer.recorder.action-log
---
