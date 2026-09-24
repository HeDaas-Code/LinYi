---
uid: f64f71d9
id: truman-town.agent.lifecycle
parent: truman-town.agent
name: {zh: "生命周期", en: "Lifecycle"}
description:
  zh: >
      管理智能体的出生、衰老与死亡，驱动小镇代际更替。
      
  en: >
      Manages birth, aging and death to drive generational turnover.
      
revision: 6939444d190f953b7c3e7a73b35ad8b25ac43b07
updated_at: "2026-09-24T02:04:23.739Z"
fingerprint: 5510f4bb5b1ec21c1d0b5eb210f6ca19ac17c9c475c6f9a150bbae694331afdf
source:
  - path: "src/agent/lifecycle.js"
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
