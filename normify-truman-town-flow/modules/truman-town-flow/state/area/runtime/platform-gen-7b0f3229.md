---
uid: c3e0a6f6
id: truman-town-flow.state.area.runtime.platform-gen-7b0f3229
parent: truman-town-flow.state.area.runtime
name: {zh: "platformGen", en: "platformGen"}
description:
  zh: >
      expr 类型，声明于 src/runtime/orchestrator/_stage2.js:46。写入方 1 个、读取方 2 个；**未纳入复位**（跨 run 可能残留）。
      
  en: >
      expr declared at src/runtime/orchestrator/_stage2.js:46; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:38.768Z"
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
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:platform-gen-7b0f3229:read-prFloat"
    label: {zh: "读 platformGen", en: "read platformGen"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:platform-gen-7b0f3229:read-prShuffle"
    label: {zh: "读 platformGen", en: "read platformGen"}
---
