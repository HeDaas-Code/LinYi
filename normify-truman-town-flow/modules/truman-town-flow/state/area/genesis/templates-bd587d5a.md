---
uid: 501c6298
id: truman-town-flow.state.area.genesis.templates-bd587d5a
parent: truman-town-flow.state.area.genesis
name: {zh: "templates", en: "templates"}
description:
  zh: >
      map 类型，声明于 src/genesis/agent-factory/template.js:42。写入方 1 个、读取方 4 个；已纳入复位。
      
  en: >
      map declared at src/genesis/agent-factory/template.js:42; writers=1, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:33.450Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "templates-bd587d5a:write-build"
    description:
      zh: >
          写入方 build（src/genesis/agent-factory/template.js）
          
      en: >
          writer build
          
  - protocol: rpc
    path: "templates-bd587d5a:read-ensure"
    description:
      zh: >
          读取方 ensure
          
      en: >
          reader ensure
          
  - protocol: rpc
    path: "templates-bd587d5a:read-get"
    description:
      zh: >
          读取方 get
          
      en: >
          reader get
          
  - protocol: rpc
    path: "templates-bd587d5a:read-list"
    description:
      zh: >
          读取方 list
          
      en: >
          reader list
          
  - protocol: rpc
    path: "templates-bd587d5a:read-instantiate"
    description:
      zh: >
          读取方 instantiate
          
      en: >
          reader instantiate
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.genesis.agent-factory.template
    from_api: "rpc:templates-bd587d5a:read-ensure"
    label: {zh: "读 templates", en: "read templates"}
  - kind: dataflow
    to: truman-town-flow.code.agent.traits.tagset.store
    from_api: "rpc:templates-bd587d5a:read-get"
    label: {zh: "读 templates", en: "read templates"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:templates-bd587d5a:read-list"
    label: {zh: "读 templates", en: "read templates"}
  - kind: dataflow
    to: truman-town-flow.code.genesis.agent-factory.template
    from_api: "rpc:templates-bd587d5a:read-instantiate"
    label: {zh: "读 templates", en: "read templates"}
---
