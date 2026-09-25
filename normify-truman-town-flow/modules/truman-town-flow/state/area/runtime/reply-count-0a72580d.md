---
uid: 27367ba0
id: truman-town-flow.state.area.runtime.reply-count-0a72580d
parent: truman-town-flow.state.area.runtime
name: {zh: "replyCount", en: "replyCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:109。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:109; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:38.768Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "reply-count-0a72580d:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "reply-count-0a72580d:write-runPlatform"
    description:
      zh: >
          写入方 runPlatform（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runPlatform
          
  - protocol: rpc
    path: "reply-count-0a72580d:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:reply-count-0a72580d:read-summary"
    label: {zh: "读 replyCount", en: "read replyCount"}
---
