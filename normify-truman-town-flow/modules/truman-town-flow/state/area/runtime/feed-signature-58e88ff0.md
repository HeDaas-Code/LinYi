---
uid: ad550a5c
id: truman-town-flow.state.area.runtime.feed-signature-58e88ff0
parent: truman-town-flow.state.area.runtime
name: {zh: "feedSignature", en: "feedSignature"}
description:
  zh: >
      array 类型，声明于 src/runtime/orchestrator/_stage2.js:115。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      array declared at src/runtime/orchestrator/_stage2.js:115; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:36.897Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "feed-signature-58e88ff0:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "feed-signature-58e88ff0:write-runPlatform"
    description:
      zh: >
          写入方 runPlatform（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runPlatform
          
  - protocol: rpc
    path: "feed-signature-58e88ff0:read-runPlatform"
    description:
      zh: >
          读取方 runPlatform
          
      en: >
          reader runPlatform
          
  - protocol: rpc
    path: "feed-signature-58e88ff0:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:feed-signature-58e88ff0:read-runPlatform"
    label: {zh: "读 feedSignature", en: "read feedSignature"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:feed-signature-58e88ff0:read-summary"
    label: {zh: "读 feedSignature", en: "read feedSignature"}
---
