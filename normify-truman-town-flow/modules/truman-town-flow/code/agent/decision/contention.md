---
uid: 254a4b93
id: truman-town-flow.code.agent.decision.contention
parent: truman-town-flow.code.agent.decision
name: {zh: "agent/decision/contention.js", en: "agent/decision/contention.js"}
description:
  zh: >
      代码模块 src/agent/decision/contention.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/decision/contention.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:42:20.962Z"
fingerprint: cd9bf2dd1736134255d01b727266314a3ca8e93da4fbf587a7bd6e527d67de80
source:
  - path: "src/agent/decision/contention.js"
apis:
  - protocol: rpc
    path: "agent.decision.contention.open"
    description:
      zh: >
          open：模块导出函数。
          
      en: >
          open: exported module function.
          
  - protocol: rpc
    path: "agent.decision.contention.isOpen"
    description:
      zh: >
          isOpen：模块导出函数。
          
      en: >
          isOpen: exported module function.
          
  - protocol: rpc
    path: "agent.decision.contention.tickOf"
    description:
      zh: >
          tickOf：模块导出函数。
          
      en: >
          tickOf: exported module function.
          
  - protocol: rpc
    path: "agent.decision.contention.remaining"
    description:
      zh: >
          remaining：模块导出函数。
          
      en: >
          remaining: exported module function.
          
  - protocol: rpc
    path: "agent.decision.contention.reserve"
    description:
      zh: >
          reserve：模块导出函数。
          
      en: >
          reserve: exported module function.
          
  - protocol: rpc
    path: "agent.decision.contention.view"
    description:
      zh: >
          view：模块导出函数。
          
      en: >
          view: exported module function.
          
  - protocol: rpc
    path: "agent.decision.contention.snapshot"
    description:
      zh: >
          snapshot：模块导出函数。
          
      en: >
          snapshot: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.pools-1c7d56f4
    to_api: "rpc:pools-1c7d56f4:write-open"
    label: {zh: "写 pools", en: "write pools"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.current-tick-f24e2da3
    to_api: "rpc:current-tick-f24e2da3:write-open"
    label: {zh: "写 currentTick", en: "write currentTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.opened-5b42f98c
    to_api: "rpc:opened-5b42f98c:write-open"
    label: {zh: "写 opened", en: "write opened"}
  - kind: dataflow
    to: truman-town-flow.state.area.economy.treasury-account-id-076bfbd7
    to_api: "rpc:treasury-account-id-076bfbd7:write-open"
    label: {zh: "写 treasuryAccountId", en: "write treasuryAccountId"}
  - kind: dataflow
    to: truman-town-flow.state.area.economy.pool-account-id-dfd57156
    to_api: "rpc:pool-account-id-dfd57156:write-open"
    label: {zh: "写 poolAccountId", en: "write poolAccountId"}
---
