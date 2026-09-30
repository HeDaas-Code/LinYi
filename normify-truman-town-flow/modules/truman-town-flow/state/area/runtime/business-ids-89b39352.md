---
uid: "20787e81"
id: truman-town-flow.state.area.runtime.business-ids-89b39352
parent: truman-town-flow.state.area.runtime
name: {zh: "businessIds", en: "businessIds"}
description:
  zh: >
      array 类型，声明于 src/runtime/orchestrator/_stage2.js:98。写入方 3 个、读取方 6 个；已纳入复位。
      
  en: >
      array declared at src/runtime/orchestrator/_stage2.js:98; writers=3, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.220Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "business-ids-89b39352:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "business-ids-89b39352:write-performAgentAction"
    description:
      zh: >
          写入方 performAgentAction（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer performAgentAction
          
  - protocol: rpc
    path: "business-ids-89b39352:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "business-ids-89b39352:read-seed"
    description:
      zh: >
          读取方 seed
          
      en: >
          reader seed
          
  - protocol: rpc
    path: "business-ids-89b39352:read-runIndustry"
    description:
      zh: >
          读取方 runIndustry
          
      en: >
          reader runIndustry
          
  - protocol: rpc
    path: "business-ids-89b39352:read-candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
          
      en: >
          reader candidateStateFor
          
  - protocol: rpc
    path: "business-ids-89b39352:read-performAgentAction"
    description:
      zh: >
          读取方 performAgentAction
          
      en: >
          reader performAgentAction
          
  - protocol: rpc
    path: "business-ids-89b39352:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "business-ids-89b39352:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.rng
    from_api: "rpc:business-ids-89b39352:read-seed"
    label: {zh: "读 businessIds", en: "read businessIds"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:business-ids-89b39352:read-runIndustry"
    label: {zh: "读 businessIds", en: "read businessIds"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:business-ids-89b39352:read-candidateStateFor"
    label: {zh: "读 businessIds", en: "read businessIds"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:business-ids-89b39352:read-performAgentAction"
    label: {zh: "读 businessIds", en: "read businessIds"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:business-ids-89b39352:read-summary"
    label: {zh: "读 businessIds", en: "read businessIds"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:business-ids-89b39352:read-__snapshot"
    label: {zh: "读 businessIds", en: "read businessIds"}
---
