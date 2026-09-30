---
uid: b4a59534
id: truman-town-flow.state.area.runtime.post-count-5b11828b
parent: truman-town-flow.state.area.runtime
name: {zh: "postCount", en: "postCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:118。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:118; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "post-count-5b11828b:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "post-count-5b11828b:write-runPlatform"
    description:
      zh: >
          写入方 runPlatform（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runPlatform
          
  - protocol: rpc
    path: "post-count-5b11828b:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "post-count-5b11828b:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "post-count-5b11828b:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:post-count-5b11828b:read-summary"
    label: {zh: "读 postCount", en: "read postCount"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:post-count-5b11828b:read-__snapshot"
    label: {zh: "读 postCount", en: "read postCount"}
---
