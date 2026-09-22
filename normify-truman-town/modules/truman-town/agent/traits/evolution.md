---
uid: fbef21f3
id: truman-town.agent.traits.evolution
parent: truman-town.agent.traits
state: planned
name: {zh: "特质演化", en: "Trait Evolution"}
description:
  zh: >
      让 tag 发生小概率变异并随时间漂移，推动代际更新。
  en: >
      Applies rare mutation and temporal drift to evolve tags across generations.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent.traits.evolution.mutate"
    description:
      zh: >
          调用 agent.traits.evolution.mutate。
      en: >
          Calls agent.traits.evolution.mutate.
  - protocol: rpc
    path: "agent.traits.evolution.drift"
    description:
      zh: >
          调用 agent.traits.evolution.drift。
      en: >
          Calls agent.traits.evolution.drift.
---
