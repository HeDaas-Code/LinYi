---
uid: 73c34ded
id: truman-town-flow.state.area.runtime.reputation-triage-treated-score-493d3084
parent: truman-town-flow.state.area.runtime
name: {zh: "reputationTriageTreatedScore", en: "reputationTriageTreatedScore"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:113。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:113; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:38.768Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "reputation-triage-treated-score-493d3084:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "reputation-triage-treated-score-493d3084:write-runHealth"
    description:
      zh: >
          写入方 runHealth（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runHealth
          
  - protocol: rpc
    path: "reputation-triage-treated-score-493d3084:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:reputation-triage-treated-score-493d3084:read-summary"
    label: {zh: "读 reputationTriageTr", en: "read reputationTriageTr"}
---
