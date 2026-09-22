---
uid: 1f87bb98
id: truman-town.civilization.state
parent: truman-town.civilization
state: planned
name: {zh: "文明状态", en: "Civilization State"}
description:
  zh: >
      统计人口、资源、存活时长等文明健康度指标。
  en: >
      Tracks civilization health metrics: population, resources and survival time.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:55:51Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "civilization.state.metrics"
    description:
      zh: >
          调用 civilization.state.metrics。
      en: >
          Calls civilization.state.metrics.
  - protocol: rpc
    path: "civilization.state.survival_time"
    description:
      zh: >
          调用 civilization.state.survival_time。
      en: >
          Calls civilization.state.survival_time.
deps:
  - kind: call
    to: truman-town.survival.goal
  - kind: call
    to: truman-town.runtime.world-state
---
