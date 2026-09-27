---
uid: fb3724c3
id: truman-town-flow.state.area.runtime.accounts-1b938aaa
parent: truman-town-flow.state.area.runtime
name: {zh: "accounts", en: "accounts"}
description:
  zh: >
      map 类型，声明于 src/runtime/orchestrator/_stage2.js:75。写入方 2 个、读取方 10 个；已纳入复位。
      
  en: >
      map declared at src/runtime/orchestrator/_stage2.js:75; writers=2, readers=10
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.220Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "accounts-1b938aaa:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "accounts-1b938aaa:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-seed"
    description:
      zh: >
          读取方 seed
          
      en: >
          reader seed
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-runMarket"
    description:
      zh: >
          读取方 runMarket
          
      en: >
          reader runMarket
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-runIndustry"
    description:
      zh: >
          读取方 runIndustry
          
      en: >
          reader runIndustry
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-runFiscal"
    description:
      zh: >
          读取方 runFiscal
          
      en: >
          reader runFiscal
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
          
      en: >
          reader candidateStateFor
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-performAgentAction"
    description:
      zh: >
          读取方 performAgentAction
          
      en: >
          reader performAgentAction
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-agentIdByAccount"
    description:
      zh: >
          读取方 agentIdByAccount
          
      en: >
          reader agentIdByAccount
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-situationOf"
    description:
      zh: >
          读取方 situationOf
          
      en: >
          reader situationOf
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "accounts-1b938aaa:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.rng
    from_api: "rpc:accounts-1b938aaa:read-seed"
    label: {zh: "读 accounts", en: "read accounts"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:accounts-1b938aaa:read-runMarket"
    label: {zh: "读 accounts", en: "read accounts"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:accounts-1b938aaa:read-runIndustry"
    label: {zh: "读 accounts", en: "read accounts"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:accounts-1b938aaa:read-runFiscal"
    label: {zh: "读 accounts", en: "read accounts"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:accounts-1b938aaa:read-candidateStateFor"
    label: {zh: "读 accounts", en: "read accounts"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:accounts-1b938aaa:read-performAgentAction"
    label: {zh: "读 accounts", en: "read accounts"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:accounts-1b938aaa:read-agentIdByAccount"
    label: {zh: "读 accounts", en: "read accounts"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:accounts-1b938aaa:read-situationOf"
    label: {zh: "读 accounts", en: "read accounts"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:accounts-1b938aaa:read-__snapshot"
    label: {zh: "读 accounts", en: "read accounts"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:accounts-1b938aaa:read-__restore"
    label: {zh: "读 accounts", en: "read accounts"}
---
