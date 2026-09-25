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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:46.551Z"
fingerprint: pending
source: []
apis: []
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
    to: truman-town-flow.state.area.civilization.active-b942d96b
    to_api: "rpc:active-b942d96b:write-start"
    label: {zh: "写 active", en: "write active"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.phase-947d7802
    to_api: "rpc:phase-947d7802:write-pause"
    label: {zh: "写 phase", en: "write phase"}
---
