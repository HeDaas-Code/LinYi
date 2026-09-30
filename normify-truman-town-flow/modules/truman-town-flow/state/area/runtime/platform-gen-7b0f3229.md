---
uid: c3e0a6f6
id: truman-town-flow.state.area.runtime.platform-gen-7b0f3229
parent: truman-town-flow.state.area.runtime
name: {zh: "platformGen", en: "platformGen"}
description:
  zh: >
      expr 类型，声明于 src/runtime/orchestrator/_stage2.js:50。写入方 2 个、读取方 7 个；已纳入复位。
      
  en: >
      expr declared at src/runtime/orchestrator/_stage2.js:50; writers=2, readers=7
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "platform-gen-7b0f3229:write-platformSeed"
    description:
      zh: >
          写入方 platformSeed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer platformSeed
          
  - protocol: rpc
    path: "platform-gen-7b0f3229:write-platformGenRestore_"
    description:
      zh: >
          写入方 platformGenRestore_（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer platformGenRestore_
          
  - protocol: rpc
    path: "platform-gen-7b0f3229:read-platformSeed"
    description:
      zh: >
          读取方 platformSeed
          
      en: >
          reader platformSeed
          
  - protocol: rpc
    path: "platform-gen-7b0f3229:read-platformGenState_"
    description:
      zh: >
          读取方 platformGenState_
          
      en: >
          reader platformGenState_
          
  - protocol: rpc
    path: "platform-gen-7b0f3229:read-platformGenRestore_"
    description:
      zh: >
          读取方 platformGenRestore_
          
      en: >
          reader platformGenRestore_
          
  - protocol: rpc
    path: "platform-gen-7b0f3229:read-prFloat"
    description:
      zh: >
          读取方 prFloat
          
      en: >
          reader prFloat
          
  - protocol: rpc
    path: "platform-gen-7b0f3229:read-prShuffle"
    description:
      zh: >
          读取方 prShuffle
          
      en: >
          reader prShuffle
          
  - protocol: rpc
    path: "platform-gen-7b0f3229:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "platform-gen-7b0f3229:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:platform-gen-7b0f3229:read-platformSeed"
    label: {zh: "读 platformGen", en: "read platformGen"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:platform-gen-7b0f3229:read-platformGenState_"
    label: {zh: "读 platformGen", en: "read platformGen"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:platform-gen-7b0f3229:read-platformGenRestore_"
    label: {zh: "读 platformGen", en: "read platformGen"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:platform-gen-7b0f3229:read-prFloat"
    label: {zh: "读 platformGen", en: "read platformGen"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:platform-gen-7b0f3229:read-prShuffle"
    label: {zh: "读 platformGen", en: "read platformGen"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:platform-gen-7b0f3229:read-__snapshot"
    label: {zh: "读 platformGen", en: "read platformGen"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:platform-gen-7b0f3229:read-__restore"
    label: {zh: "读 platformGen", en: "read platformGen"}
---
