---
uid: 728119f9
id: truman-town.genesis.agent-factory.template
parent: truman-town.genesis.agent-factory
name: {zh: "模板生成", en: "Template Builder"}
description:
  zh: >
      从特质与角色构建智能体模板。
      
  en: >
      Builds agent templates from traits and roles.
      
revision: 02dffcd347b42bfde4f8a766a3a77cff7de9c286
updated_at: "2026-09-25T10:17:35.033Z"
fingerprint: 27e8c6edfe0c11ef1ce3357b3b5c026a582504e1a821ae306ff9e0ebd08196ad
source:
  - path: "src/genesis/agent-factory/template.js"
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
