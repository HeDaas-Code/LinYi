---
uid: 03dc7bc4
id: truman-town-flow.state.area.runtime.mortality-4ab46b0e
parent: truman-town-flow.state.area.runtime
name: {zh: "mortality", en: "mortality"}
description:
  zh: >
      map 类型，声明于 src/runtime/orchestrator/loop.js:835。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      map declared at src/runtime/orchestrator/loop.js:835; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:42.543Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "mortality-4ab46b0e:write-runMortality"
    description:
      zh: >
          写入方 runMortality（src/runtime/orchestrator/loop.js）
          
      en: >
          writer runMortality
          
  - protocol: rpc
    path: "mortality-4ab46b0e:read-runMortality"
    description:
      zh: >
          读取方 runMortality
          
      en: >
          reader runMortality
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:mortality-4ab46b0e:read-runMortality"
    label: {zh: "读 mortality", en: "read mortality"}
---
