---
uid: a4dd922c
id: truman-town-flow.state.area.runtime.law-id-09d4b738
parent: truman-town-flow.state.area.runtime
name: {zh: "lawId", en: "lawId"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage3.js:22。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage3.js:22; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:40.619Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "law-id-09d4b738:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "law-id-09d4b738:read-runPolitics"
    description:
      zh: >
          读取方 runPolitics
          
      en: >
          reader runPolitics
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage3
    from_api: "rpc:law-id-09d4b738:read-runPolitics"
    label: {zh: "读 lawId", en: "read lawId"}
---
