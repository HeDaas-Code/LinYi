---
uid: 3ec9e200
id: truman-town.genesis.agent-factory.assemble
parent: truman-town.genesis.agent-factory
name: {zh: "智能体组装", en: "Agent Assembly"}
description:
  zh: >
      组装并注册新智能体到沙盘运行时。
      
  en: >
      Assembles and registers new agents into the runtime.
      
revision: 02dffcd347b42bfde4f8a766a3a77cff7de9c286
updated_at: "2026-09-25T10:17:35.034Z"
fingerprint: 437e1e559322ca7923fc39370b5f9916d8f563ab980f7a6f19cff31451d7f2f7
source:
  - path: "src/genesis/agent-factory/assemble.js"
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
