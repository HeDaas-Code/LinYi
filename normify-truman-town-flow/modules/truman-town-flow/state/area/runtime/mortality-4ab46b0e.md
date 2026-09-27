---
uid: 03dc7bc4
id: truman-town-flow.state.area.runtime.mortality-4ab46b0e
parent: truman-town-flow.state.area.runtime
name: {zh: "mortality", en: "mortality"}
description:
  zh: >
      map 类型，声明于 src/runtime/orchestrator/loop.js:1332。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      map declared at src/runtime/orchestrator/loop.js:1332; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
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
    path: "mortality-4ab46b0e:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/loop.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "mortality-4ab46b0e:read-runMortality"
    description:
      zh: >
          读取方 runMortality
          
      en: >
          reader runMortality
          
  - protocol: rpc
    path: "mortality-4ab46b0e:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "mortality-4ab46b0e:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:mortality-4ab46b0e:read-runMortality"
    label: {zh: "读 mortality", en: "read mortality"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:mortality-4ab46b0e:read-__snapshot"
    label: {zh: "读 mortality", en: "read mortality"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:mortality-4ab46b0e:read-__restore"
    label: {zh: "读 mortality", en: "read mortality"}
---
