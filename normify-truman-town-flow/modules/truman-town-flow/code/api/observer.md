---
uid: fa57cbfb
id: truman-town-flow.code.api.observer
parent: truman-town-flow.code.api
name: {zh: "api/observer.js", en: "api/observer.js"}
description:
  zh: >
      代码模块 src/api/observer.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/api/observer.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:38.519Z"
fingerprint: 72ec664f5d4a3a69b78dcbc4e934afb980396b11f406f769b3f6fab3b452eceb
source:
  - path: "src/api/observer.js"
apis:
  - protocol: rpc
    path: "api.observer.worldState"
    description:
      zh: >
          worldState：模块导出函数。
          
      en: >
          worldState: exported module function.
          
  - protocol: rpc
    path: "api.observer.agentDetail"
    description:
      zh: >
          agentDetail：模块导出函数。
          
      en: >
          agentDetail: exported module function.
          
  - protocol: rpc
    path: "api.observer.simStatus"
    description:
      zh: >
          simStatus：模块导出函数。
          
      en: >
          simStatus: exported module function.
          
  - protocol: rpc
    path: "api.observer.stages"
    description:
      zh: >
          stages：模块导出函数。
          
      en: >
          stages: exported module function.
          
  - protocol: rpc
    path: "api.observer.streamEvents"
    description:
      zh: >
          streamEvents：模块导出函数。
          
      en: >
          streamEvents: exported module function.
          
  - protocol: rpc
    path: "api.observer.recentDecisions"
    description:
      zh: >
          recentDecisions：模块导出函数。
          
      en: >
          recentDecisions: exported module function.
          
  - protocol: rpc
    path: "api.observer.decisionTrace"
    description:
      zh: >
          decisionTrace：模块导出函数。
          
      en: >
          decisionTrace: exported module function.
          
  - protocol: rpc
    path: "api.observer.persistenceStatus"
    description:
      zh: >
          persistenceStatus：模块导出函数。
          
      en: >
          persistenceStatus: exported module function.
          
  - protocol: rpc
    path: "api.observer.saveRun"
    description:
      zh: >
          saveRun：模块导出函数。
          
      en: >
          saveRun: exported module function.
          
  - protocol: rpc
    path: "api.observer.restoreRun"
    description:
      zh: >
          restoreRun：模块导出函数。
          
      en: >
          restoreRun: exported module function.
          
  - protocol: rpc
    path: "api.observer.routes"
    description:
      zh: >
          routes：模块导出函数。
          
      en: >
          routes: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.api.last-snapshot-6b34bb05
    to_api: "rpc:last-snapshot-6b34bb05:write-saveRun"
    label: {zh: "写 lastSnapshot", en: "write lastSnapshot"}
  - kind: dataflow
    to: truman-town-flow.state.area.api.journal-38e68294
    to_api: "rpc:journal-38e68294:write-saveRun"
    label: {zh: "写 journal", en: "write journal"}
  - kind: dataflow
    to: truman-town-flow.state.area.api.journal-38e68294
    to_api: "rpc:journal-38e68294:write-restoreRun"
    label: {zh: "写 journal", en: "write journal"}
---
