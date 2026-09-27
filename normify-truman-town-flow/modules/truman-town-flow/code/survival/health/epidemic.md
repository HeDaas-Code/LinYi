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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:24.455Z"
fingerprint: pending
source: []
apis: []
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
