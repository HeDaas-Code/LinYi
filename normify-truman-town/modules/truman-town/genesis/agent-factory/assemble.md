---
uid: 3ec9e200
id: truman-town.genesis.agent-factory.assemble
parent: truman-town.genesis.agent-factory
state: planned
name: {zh: "智能体组装", en: "Agent Assembly"}
description:
  zh: >
      组装并注册新智能体到沙盘运行时。
  en: >
      Assembles and registers new agents into the runtime.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "genesis.agent_factory.assemble.create"
    description:
      zh: >
          调用 genesis.agent_factory.assemble.create。
      en: >
          Calls genesis.agent_factory.assemble.create.
  - protocol: rpc
    path: "genesis.agent_factory.assemble.register"
    description:
      zh: >
          调用 genesis.agent_factory.assemble.register。
      en: >
          Calls genesis.agent_factory.assemble.register.
deps:
  - kind: call
    to: truman-town.agent.lifecycle
  - kind: call
    to: truman-town.runtime.registry
---
