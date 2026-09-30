---
uid: 1f87bb98
id: truman-town.civilization.state
parent: truman-town.civilization
state: deprecated
replacement: truman-town.survival.goal
name: {zh: "文明状态", en: "Civilization State"}
description:
  zh: >
      （已废弃，能力由 truman-town.survival.goal 承担：goal.survive/elapsed 负责存活时长；人口与资源健康度见 civilization.collapse.detector。保留此条目以记录设计意图的归属。）
  en: >
      Deprecated: this capability lives in truman-town.survival.goal. Kept to record where the original intent ended up.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-26T03:30:38.769Z"
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
