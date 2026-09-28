---
uid: fbef21f3
id: truman-town.agent.traits.evolution
parent: truman-town.agent.traits
name: {zh: "特质演化", en: "Trait Evolution"}
description:
  zh: >
      让 tag 发生小概率变异并随时间漂移，推动代际更新。
      
  en: >
      Applies rare mutation and temporal drift to evolve tags across generations.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.832Z"
fingerprint: d4345ace445bdb2f93b3190779cb7bdae37232b21603d773763286c6f50f1053
source:
  - path: "src/agent/traits/evolution.js"
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
