---
uid: c371c878
id: truman-town.genesis.world-factory
parent: truman-town.genesis
state: deprecated
replacement: truman-town.town.map.topology
name: {zh: "世界工厂", en: "World Factory"}
description:
  zh: >
      （已废弃，能力由 truman-town.town.map.topology 承担：topology.plan/query/adjacent 负责世界布局生成。保留此条目以记录设计意图的归属。）
  en: >
      Deprecated: this capability lives in truman-town.town.map.topology. Kept to record where the original intent ended up.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-26T03:30:37.222Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "genesis.world_factory.create_town"
    description:
      zh: >
          调用 genesis.world_factory.create_town。
          
      en: >
          Calls genesis.world_factory.create_town.
          
  - protocol: rpc
    path: "genesis.world_factory.create_agents"
    description:
      zh: >
          调用 genesis.world_factory.create_agents。
          
      en: >
          Calls genesis.world_factory.create_agents.
          
deps:
  - kind: call
    to: truman-town.genesis.agent-factory.assemble
  - kind: call
    to: truman-town.town.map.topology
---
