---
uid: 628c8805
id: truman-town-flow.code.survival.health.epidemic
parent: truman-town-flow.code.survival.health
name: {zh: "survival/health/epidemic.js", en: "survival/health/epidemic.js"}
description:
  zh: >
      代码模块 src/survival/health/epidemic.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/survival/health/epidemic.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:36:05.928Z"
fingerprint: dd4d11eff1ed174fb43b21f8c84fa51a8b9ad50d4422026019b5683b88dac227
source:
  - path: "src/survival/health/epidemic.js"
apis:
  - protocol: rpc
    path: "survival.health.epidemic.detect"
    description:
      zh: >
          detect：模块导出函数。
          
      en: >
          detect: exported module function.
          
  - protocol: rpc
    path: "survival.health.epidemic.quarantine"
    description:
      zh: >
          quarantine：模块导出函数。
          
      en: >
          quarantine: exported module function.
          
  - protocol: rpc
    path: "survival.health.epidemic.isQuarantined"
    description:
      zh: >
          isQuarantined：模块导出函数。
          
      en: >
          isQuarantined: exported module function.
          
  - protocol: rpc
    path: "survival.health.epidemic.listQuarantined"
    description:
      zh: >
          listQuarantined：模块导出函数。
          
      en: >
          listQuarantined: exported module function.
          
  - protocol: rpc
    path: "survival.health.epidemic.release"
    description:
      zh: >
          release：模块导出函数。
          
      en: >
          release: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.survival.quarantined-7d0301dd
    to_api: "rpc:quarantined-7d0301dd:write-quarantine"
    label: {zh: "写 quarantined", en: "write quarantined"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.quarantined-7d0301dd
    to_api: "rpc:quarantined-7d0301dd:write-release"
    label: {zh: "写 quarantined", en: "write quarantined"}
---
