---
uid: 23ca34b8
id: truman-town-flow.state.area.runtime.platform-gen-state-505afe0a
parent: truman-town-flow.state.area.runtime
name: {zh: "platformGenState", en: "platformGenState"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:49。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:49; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "platform-gen-state-505afe0a:write-platformSeed"
    description:
      zh: >
          写入方 platformSeed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer platformSeed
          
  - protocol: rpc
    path: "platform-gen-state-505afe0a:write-platformGenRestore_"
    description:
      zh: >
          写入方 platformGenRestore_（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer platformGenRestore_
          
  - protocol: rpc
    path: "platform-gen-state-505afe0a:read-platformGenState_"
    description:
      zh: >
          读取方 platformGenState_
          
      en: >
          reader platformGenState_
          
  - protocol: rpc
    path: "platform-gen-state-505afe0a:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:platform-gen-state-505afe0a:read-platformGenState_"
    label: {zh: "读 platformGenState", en: "read platformGenState"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:platform-gen-state-505afe0a:read-__snapshot"
    label: {zh: "读 platformGenState", en: "read platformGenState"}
---
