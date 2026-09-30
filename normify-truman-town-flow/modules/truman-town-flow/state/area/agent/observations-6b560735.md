---
uid: be53762f
id: truman-town-flow.state.area.agent.observations-6b560735
parent: truman-town-flow.state.area.agent
name: {zh: "observations", en: "observations"}
description:
  zh: >
      number 类型，声明于 src/agent/decision/outcome-model.js:37。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/agent/decision/outcome-model.js:37; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "observations-6b560735:write-observe"
    description:
      zh: >
          写入方 observe（src/agent/decision/outcome-model.js）
          
      en: >
          writer observe
          
  - protocol: rpc
    path: "observations-6b560735:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/decision/outcome-model.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "observations-6b560735:read-stats"
    description:
      zh: >
          读取方 stats
          
      en: >
          reader stats
          
  - protocol: rpc
    path: "observations-6b560735:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "observations-6b560735:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.outcome-model
    from_api: "rpc:observations-6b560735:read-stats"
    label: {zh: "读 observations", en: "read observations"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:observations-6b560735:read-__snapshot"
    label: {zh: "读 observations", en: "read observations"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:observations-6b560735:read-__restore"
    label: {zh: "读 observations", en: "read observations"}
---
