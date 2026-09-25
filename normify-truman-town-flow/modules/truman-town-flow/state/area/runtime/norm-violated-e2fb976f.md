---
uid: 2806f44b
id: truman-town-flow.state.area.runtime.norm-violated-e2fb976f
parent: truman-town-flow.state.area.runtime
name: {zh: "normViolated", en: "normViolated"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/_stage3.js:26。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      flag declared at src/runtime/orchestrator/_stage3.js:26; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:40.619Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "norm-violated-e2fb976f:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "norm-violated-e2fb976f:write-runCulture"
    description:
      zh: >
          写入方 runCulture（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runCulture
          
  - protocol: rpc
    path: "norm-violated-e2fb976f:read-runCulture"
    description:
      zh: >
          读取方 runCulture
          
      en: >
          reader runCulture
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage3
    from_api: "rpc:norm-violated-e2fb976f:read-runCulture"
    label: {zh: "读 normViolated", en: "read normViolated"}
---
