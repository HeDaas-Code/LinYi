---
uid: b78d8648
id: truman-town-flow.state.area.runtime.paired-index-c43bcba9
parent: truman-town-flow.state.area.runtime
name: {zh: "pairedIndex", en: "pairedIndex"}
description:
  zh: >
      map 类型，声明于 src/runtime/orchestrator/_stage2.js:84。写入方 2 个、读取方 6 个；已纳入复位。
      
  en: >
      map declared at src/runtime/orchestrator/_stage2.js:84; writers=2, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "paired-index-c43bcba9:write-performAgentAction"
    description:
      zh: >
          写入方 performAgentAction（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer performAgentAction
          
  - protocol: rpc
    path: "paired-index-c43bcba9:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "paired-index-c43bcba9:read-runProcreation"
    description:
      zh: >
          读取方 runProcreation
          
      en: >
          reader runProcreation
          
  - protocol: rpc
    path: "paired-index-c43bcba9:read-candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
          
      en: >
          reader candidateStateFor
          
  - protocol: rpc
    path: "paired-index-c43bcba9:read-expeditionConditionsFor"
    description:
      zh: >
          读取方 expeditionConditionsFor
          
      en: >
          reader expeditionConditionsFor
          
  - protocol: rpc
    path: "paired-index-c43bcba9:read-performAgentAction"
    description:
      zh: >
          读取方 performAgentAction
          
      en: >
          reader performAgentAction
          
  - protocol: rpc
    path: "paired-index-c43bcba9:read-pickMate"
    description:
      zh: >
          读取方 pickMate
          
      en: >
          reader pickMate
          
  - protocol: rpc
    path: "paired-index-c43bcba9:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:paired-index-c43bcba9:read-runProcreation"
    label: {zh: "读 pairedIndex", en: "read pairedIndex"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:paired-index-c43bcba9:read-candidateStateFor"
    label: {zh: "读 pairedIndex", en: "read pairedIndex"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:paired-index-c43bcba9:read-expeditionConditionsFor"
    label: {zh: "读 pairedIndex", en: "read pairedIndex"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:paired-index-c43bcba9:read-performAgentAction"
    label: {zh: "读 pairedIndex", en: "read pairedIndex"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:paired-index-c43bcba9:read-pickMate"
    label: {zh: "读 pairedIndex", en: "read pairedIndex"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:paired-index-c43bcba9:read-__snapshot"
    label: {zh: "读 pairedIndex", en: "read pairedIndex"}
---
