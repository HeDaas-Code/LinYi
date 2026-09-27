---
uid: 8cabbc39
id: truman-town-flow.state.area.runtime.memes-mutated-ace2d86a
parent: truman-town-flow.state.area.runtime
name: {zh: "memesMutated", en: "memesMutated"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:37。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:37; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:08.999Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "memes-mutated-ace2d86a:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "memes-mutated-ace2d86a:write-runCulture"
    description:
      zh: >
          写入方 runCulture（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runCulture
          
  - protocol: rpc
    path: "memes-mutated-ace2d86a:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "memes-mutated-ace2d86a:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "memes-mutated-ace2d86a:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:memes-mutated-ace2d86a:read-summary"
    label: {zh: "读 memesMutated", en: "read memesMutated"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:memes-mutated-ace2d86a:read-__snapshot"
    label: {zh: "读 memesMutated", en: "read memesMutated"}
---
