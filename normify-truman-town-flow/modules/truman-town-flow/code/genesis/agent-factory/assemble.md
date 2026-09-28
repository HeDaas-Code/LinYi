---
uid: 3e13b017
id: truman-town-flow.code.genesis.agent-factory.assemble
parent: truman-town-flow.code.genesis.agent-factory
name: {zh: "genesis/agent-factory/assemble.js", en: "genesis/agent-factory/assemble.js"}
description:
  zh: >
      代码模块 src/genesis/agent-factory/assemble.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/genesis/agent-factory/assemble.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:44.588Z"
fingerprint: 437e1e559322ca7923fc39370b5f9916d8f563ab980f7a6f19cff31451d7f2f7
source:
  - path: "src/genesis/agent-factory/assemble.js"
apis:
  - protocol: rpc
    path: "genesis.agent-factory.assemble.create"
    description:
      zh: >
          create：模块导出函数。
          
      en: >
          create: exported module function.
          
  - protocol: rpc
    path: "genesis.agent-factory.assemble.register"
    description:
      zh: >
          register：模块导出函数。
          
      en: >
          register: exported module function.
          
  - protocol: rpc
    path: "genesis.agent-factory.assemble.list"
    description:
      zh: >
          list：模块导出函数。
          
      en: >
          list: exported module function.
          
  - protocol: rpc
    path: "genesis.agent-factory.assemble.get"
    description:
      zh: >
          get：模块导出函数。
          
      en: >
          get: exported module function.
          
  - protocol: rpc
    path: "genesis.agent-factory.assemble.getStats"
    description:
      zh: >
          getStats：模块导出函数。
          
      en: >
          getStats: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.genesis.assembled-59d1a157
    to_api: "rpc:assembled-59d1a157:write-create"
    label: {zh: "写 assembled", en: "write assembled"}
---
