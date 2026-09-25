---
uid: 67ba8aa5
id: truman-town-flow.state.area.runtime.faction-a-2a4cccd8
parent: truman-town-flow.state.area.runtime
name: {zh: "factionA", en: "factionA"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage3.js:19。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage3.js:19; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:40.619Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "faction-a-2a4cccd8:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "faction-a-2a4cccd8:read-seed"
    description:
      zh: >
          读取方 seed
          
      en: >
          reader seed
          
  - protocol: rpc
    path: "faction-a-2a4cccd8:read-runPolitics"
    description:
      zh: >
          读取方 runPolitics
          
      en: >
          reader runPolitics
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.rng
    from_api: "rpc:faction-a-2a4cccd8:read-seed"
    label: {zh: "读 factionA", en: "read factionA"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage3
    from_api: "rpc:faction-a-2a4cccd8:read-runPolitics"
    label: {zh: "读 factionA", en: "read factionA"}
---
