---
uid: daf71aa3
id: truman-town-flow.state.area.runtime.researches-completed-cae00af3
parent: truman-town-flow.state.area.runtime
name: {zh: "researchesCompleted", en: "researchesCompleted"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:42。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:42; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:40.619Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "researches-completed-cae00af3:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "researches-completed-cae00af3:write-runTech"
    description:
      zh: >
          写入方 runTech（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runTech
          
  - protocol: rpc
    path: "researches-completed-cae00af3:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:researches-completed-cae00af3:read-summary"
    label: {zh: "读 researchesComplete", en: "read researchesComplete"}
---
