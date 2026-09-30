---
uid: be72bd83
id: truman-town-flow.state.area.runtime.credit-issued-4489bb1e
parent: truman-town-flow.state.area.runtime
name: {zh: "creditIssued", en: "creditIssued"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:102。写入方 3 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:102; writers=3, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.221Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "credit-issued-4489bb1e:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "credit-issued-4489bb1e:write-performAgentAction"
    description:
      zh: >
          写入方 performAgentAction（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer performAgentAction
          
  - protocol: rpc
    path: "credit-issued-4489bb1e:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "credit-issued-4489bb1e:read-runFiscal"
    description:
      zh: >
          读取方 runFiscal
          
      en: >
          reader runFiscal
          
  - protocol: rpc
    path: "credit-issued-4489bb1e:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "credit-issued-4489bb1e:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:credit-issued-4489bb1e:read-runFiscal"
    label: {zh: "读 creditIssued", en: "read creditIssued"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:credit-issued-4489bb1e:read-summary"
    label: {zh: "读 creditIssued", en: "read creditIssued"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:credit-issued-4489bb1e:read-__snapshot"
    label: {zh: "读 creditIssued", en: "read creditIssued"}
---
