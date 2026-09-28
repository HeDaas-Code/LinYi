---
uid: 60eb8282
id: truman-town-flow.code.api.control
parent: truman-town-flow.code.api
name: {zh: "api/control.js", en: "api/control.js"}
description:
  zh: >
      代码模块 src/api/control.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/api/control.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:37.803Z"
fingerprint: 23eff409096678790232c3960c6606e194e70d863bc0d09ba120c41302c87fa9
source:
  - path: "src/api/control.js"
apis:
  - protocol: rpc
    path: "api.control.start"
    description:
      zh: >
          start：模块导出函数。
          
      en: >
          start: exported module function.
          
  - protocol: rpc
    path: "api.control.pause"
    description:
      zh: >
          pause：模块导出函数。
          
      en: >
          pause: exported module function.
          
  - protocol: rpc
    path: "api.control.currentPhase"
    description:
      zh: >
          currentPhase：模块导出函数。
          
      en: >
          currentPhase: exported module function.
          
  - protocol: rpc
    path: "api.control.stop"
    description:
      zh: >
          stop：模块导出函数。
          
      en: >
          stop: exported module function.
          
  - protocol: rpc
    path: "api.control.resume"
    description:
      zh: >
          resume：模块导出函数。
          
      en: >
          resume: exported module function.
          
  - protocol: rpc
    path: "api.control.getPacing"
    description:
      zh: >
          getPacing：模块导出函数。
          
      en: >
          getPacing: exported module function.
          
  - protocol: rpc
    path: "api.control.setPacing"
    description:
      zh: >
          setPacing：模块导出函数。
          
      en: >
          setPacing: exported module function.
          
  - protocol: rpc
    path: "api.control.step"
    description:
      zh: >
          step：模块导出函数。
          
      en: >
          step: exported module function.
          
  - protocol: rpc
    path: "api.control.listDifficulties"
    description:
      zh: >
          listDifficulties：模块导出函数。
          
      en: >
          listDifficulties: exported module function.
          
  - protocol: rpc
    path: "api.control.getDifficulty"
    description:
      zh: >
          getDifficulty：模块导出函数。
          
      en: >
          getDifficulty: exported module function.
          
  - protocol: rpc
    path: "api.control.setDifficulty"
    description:
      zh: >
          setDifficulty：模块导出函数。
          
      en: >
          setDifficulty: exported module function.
          
  - protocol: rpc
    path: "api.control.routes"
    description:
      zh: >
          routes：模块导出函数。
          
      en: >
          routes: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.api.phase-1c73471d
    to_api: "rpc:phase-1c73471d:write-start"
    label: {zh: "写 phase", en: "write phase"}
  - kind: dataflow
    to: truman-town-flow.state.area.api.phase-1c73471d
    to_api: "rpc:phase-1c73471d:write-pause"
    label: {zh: "写 phase", en: "write phase"}
  - kind: dataflow
    to: truman-town-flow.state.area.api.phase-1c73471d
    to_api: "rpc:phase-1c73471d:write-step"
    label: {zh: "写 phase", en: "write phase"}
  - kind: dataflow
    to: truman-town-flow.state.area.civilization.active-b942d96b
    to_api: "rpc:active-b942d96b:write-start"
    label: {zh: "写 active", en: "write active"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.phase-947d7802
    to_api: "rpc:phase-947d7802:write-pause"
    label: {zh: "写 phase", en: "write phase"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.in-flight-53dcc34c
    to_api: "rpc:in-flight-53dcc34c:write-step"
    label: {zh: "写 inFlight", en: "write inFlight"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.stage-error-f79c4049
    to_api: "rpc:stage-error-f79c4049:write-step"
    label: {zh: "写 stageError", en: "write stageError"}
---
