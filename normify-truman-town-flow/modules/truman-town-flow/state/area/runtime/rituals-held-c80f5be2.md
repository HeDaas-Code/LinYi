---
uid: 976a8bdc
id: truman-town-flow.state.area.runtime.rituals-held-c80f5be2
parent: truman-town-flow.state.area.runtime
name: {zh: "ritualsHeld", en: "ritualsHeld"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:35。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:35; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:42.542Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "rituals-held-c80f5be2:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "rituals-held-c80f5be2:write-runCulture"
    description:
      zh: >
          写入方 runCulture（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runCulture
          
  - protocol: rpc
    path: "rituals-held-c80f5be2:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:rituals-held-c80f5be2:read-summary"
    label: {zh: "读 ritualsHeld", en: "read ritualsHeld"}
---
