---
uid: 2138ebec
id: truman-town-flow.state.area.genesis.assembled-59d1a157
parent: truman-town-flow.state.area.genesis
name: {zh: "assembled", en: "assembled"}
description:
  zh: >
      map 类型，声明于 src/genesis/agent-factory/assemble.js:21。写入方 1 个、读取方 4 个；已纳入复位。
      
  en: >
      map declared at src/genesis/agent-factory/assemble.js:21; writers=1, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:33.450Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "assembled-59d1a157:write-create"
    description:
      zh: >
          写入方 create（src/genesis/agent-factory/assemble.js）
          
      en: >
          writer create
          
  - protocol: rpc
    path: "assembled-59d1a157:read-create"
    description:
      zh: >
          读取方 create
          
      en: >
          reader create
          
  - protocol: rpc
    path: "assembled-59d1a157:read-list"
    description:
      zh: >
          读取方 list
          
      en: >
          reader list
          
  - protocol: rpc
    path: "assembled-59d1a157:read-get"
    description:
      zh: >
          读取方 get
          
      en: >
          reader get
          
  - protocol: rpc
    path: "assembled-59d1a157:read-getStats"
    description:
      zh: >
          读取方 getStats
          
      en: >
          reader getStats
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.genesis.agent-factory.assemble
    from_api: "rpc:assembled-59d1a157:read-create"
    label: {zh: "读 assembled", en: "read assembled"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:assembled-59d1a157:read-list"
    label: {zh: "读 assembled", en: "read assembled"}
  - kind: dataflow
    to: truman-town-flow.code.agent.traits.tagset.store
    from_api: "rpc:assembled-59d1a157:read-get"
    label: {zh: "读 assembled", en: "read assembled"}
  - kind: dataflow
    to: truman-town-flow.code.ai.laya
    from_api: "rpc:assembled-59d1a157:read-getStats"
    label: {zh: "读 assembled", en: "read assembled"}
---
