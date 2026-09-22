---
uid: c371c878
id: truman-town.genesis.world-factory
parent: truman-town.genesis
state: planned
name: {zh: "世界工厂", en: "World Factory"}
description:
  zh: >
      创建初始小镇空间、设施与首批智能体。
  en: >
      Creates initial town spaces, facilities and founding agents.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
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
