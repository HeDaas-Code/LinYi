---
uid: 3525fd05
id: truman-town-flow.state.area.runtime.step-count-fcd89684
parent: truman-town-flow.state.area.runtime
name: {zh: "stepCount", en: "stepCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/cycle.js:13。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/cycle.js:13; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "step-count-fcd89684:write-run"
    description:
      zh: >
          写入方 run（src/runtime/orchestrator/cycle.js）
          
      en: >
          writer run
          
  - protocol: rpc
    path: "step-count-fcd89684:read-status"
    description:
      zh: >
          读取方 status
          
      en: >
          reader status
          
  - protocol: rpc
    path: "step-count-fcd89684:read-run"
    description:
      zh: >
          读取方 run
          
      en: >
          reader run
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.api.control
    from_api: "rpc:step-count-fcd89684:read-status"
    label: {zh: "读 stepCount", en: "read stepCount"}
  - kind: dataflow
    to: truman-town-flow.code.infra.events.retry
    from_api: "rpc:step-count-fcd89684:read-run"
    label: {zh: "读 stepCount", en: "read stepCount"}
---
