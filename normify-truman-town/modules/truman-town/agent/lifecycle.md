---
uid: f64f71d9
id: truman-town.agent.lifecycle
parent: truman-town.agent
state: planned
name: {zh: "生命周期", en: "Lifecycle"}
description:
  zh: >
      管理智能体的出生、衰老与死亡，驱动小镇代际更替。
  en: >
      Manages birth, aging and death to drive generational turnover.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent.lifecycle.birth"
    description:
      zh: >
          调用 agent.lifecycle.birth。
      en: >
          Calls agent.lifecycle.birth.
  - protocol: rpc
    path: "agent.lifecycle.age"
    description:
      zh: >
          调用 agent.lifecycle.age。
      en: >
          Calls agent.lifecycle.age.
  - protocol: rpc
    path: "agent.lifecycle.death"
    description:
      zh: >
          调用 agent.lifecycle.death。
      en: >
          Calls agent.lifecycle.death.
---
