---
uid: 2f078078
id: truman-town.survival.environment.expedition
parent: truman-town.survival.environment
state: planned
name: {zh: "探索结算", en: "Expedition Resolution"}
description:
  zh: >
      把外出探索简化为一次计算：综合辐射、天气、物资、装备、Agent 特质、生存状态与随机数，得出探索结果；结果仅体现为一段日志、资源变化和 Agent 状态变化，不创建开放世界。
  en: >
      Resolves expeditions as one computation combining radiation, weather, supplies, gear, agent traits, survival state and randomness; the result is only a log entry plus resource and agent-state changes — no open world.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:20:43Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "survival.environment.expedition.plan"
    description:
      zh: >
          评估本次探索的条件、风险与预期收益。
      en: >
          Assesses conditions, risks and expected gains for an expedition.
  - protocol: rpc
    path: "survival.environment.expedition.execute"
    description:
      zh: >
          综合各方因素与随机数，计算探索结果。
      en: >
          Computes the expedition outcome from factors and randomness.
  - protocol: rpc
    path: "survival.environment.expedition.settle"
    description:
      zh: >
          把探索结果落为日志、资源变化和 Agent 状态变化。
      en: >
          Settles the outcome as a log entry plus resource and agent-state changes.
deps:
  - kind: call
    to: truman-town.survival.environment.radiation
  - kind: call
    to: truman-town.survival.environment.weather
  - kind: call
    to: truman-town.agent.traits.tagset
  - kind: call
    to: truman-town.agent.inventory.backpack
  - kind: call
    to: truman-town.survival.resources.food
  - kind: call
    to: truman-town.survival.resources.water
  - kind: call
    to: truman-town.survival.resources.medical
  - kind: call
    to: truman-town.survival.needs.meter
  - kind: call
    to: truman-town.survival.health.disease
  - kind: call
    to: truman-town.infra.rng
  - kind: call
    to: truman-town.observer.recorder
  - kind: dataflow
    to: truman-town.agent.memory.episodic
---
