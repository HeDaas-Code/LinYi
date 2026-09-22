---
uid: 728119f9
id: truman-town.genesis.agent-factory.template
parent: truman-town.genesis.agent-factory
state: planned
name: {zh: "模板生成", en: "Template Builder"}
description:
  zh: >
      从特质与角色构建智能体模板。
  en: >
      Builds agent templates from traits and roles.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "genesis.agent_factory.template.build"
    description:
      zh: >
          调用 genesis.agent_factory.template.build。
      en: >
          Calls genesis.agent_factory.template.build.
  - protocol: rpc
    path: "genesis.agent_factory.template.instantiate"
    description:
      zh: >
          调用 genesis.agent_factory.template.instantiate。
      en: >
          Calls genesis.agent_factory.template.instantiate.
deps:
  - kind: call
    to: truman-town.agent.traits.tagset
---
