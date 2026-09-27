---
uid: d5eb8e85
id: truman-town-flow.state.area.runtime.allied-3f55bd00
parent: truman-town-flow.state.area.runtime
name: {zh: "allied", en: "allied"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/_stage3.js:21。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      flag declared at src/runtime/orchestrator/_stage3.js:21; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.232Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "allied-3f55bd00:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "allied-3f55bd00:write-runPolitics"
    description:
      zh: >
          写入方 runPolitics（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runPolitics
          
  - protocol: rpc
    path: "allied-3f55bd00:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "allied-3f55bd00:read-runPolitics"
    description:
      zh: >
          读取方 runPolitics
          
      en: >
          reader runPolitics
          
  - protocol: rpc
    path: "allied-3f55bd00:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage3
    from_api: "rpc:allied-3f55bd00:read-runPolitics"
    label: {zh: "读 allied", en: "read allied"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:allied-3f55bd00:read-__snapshot"
    label: {zh: "读 allied", en: "read allied"}
---
