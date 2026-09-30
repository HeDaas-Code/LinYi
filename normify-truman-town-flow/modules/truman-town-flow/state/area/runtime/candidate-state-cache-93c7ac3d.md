---
uid: e259758e
id: truman-town-flow.state.area.runtime.candidate-state-cache-93c7ac3d
parent: truman-town-flow.state.area.runtime
name: {zh: "_candidateStateCache", en: "_candidateStateCache"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage2.js:902。写入方 2 个、读取方 6 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage2.js:902; writers=2, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.220Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "candidate-state-cache-93c7ac3d:write-candidateStateFor"
    description:
      zh: >
          写入方 candidateStateFor（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer candidateStateFor
          
  - protocol: rpc
    path: "candidate-state-cache-93c7ac3d:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "candidate-state-cache-93c7ac3d:read-cacheBalance"
    description:
      zh: >
          读取方 cacheBalance
          
      en: >
          reader cacheBalance
          
  - protocol: rpc
    path: "candidate-state-cache-93c7ac3d:read-cacheActiveCount"
    description:
      zh: >
          读取方 cacheActiveCount
          
      en: >
          reader cacheActiveCount
          
  - protocol: rpc
    path: "candidate-state-cache-93c7ac3d:read-cacheStartedIds"
    description:
      zh: >
          读取方 cacheStartedIds
          
      en: >
          reader cacheStartedIds
          
  - protocol: rpc
    path: "candidate-state-cache-93c7ac3d:read-demandPerTickEstimate"
    description:
      zh: >
          读取方 demandPerTickEstimate
          
      en: >
          reader demandPerTickEstimate
          
  - protocol: rpc
    path: "candidate-state-cache-93c7ac3d:read-candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
          
      en: >
          reader candidateStateFor
          
  - protocol: rpc
    path: "candidate-state-cache-93c7ac3d:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:candidate-state-cache-93c7ac3d:read-cacheBalance"
    label: {zh: "读 _candidateStateCac", en: "read _candidateStateCac"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:candidate-state-cache-93c7ac3d:read-cacheActiveCount"
    label: {zh: "读 _candidateStateCac", en: "read _candidateStateCac"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:candidate-state-cache-93c7ac3d:read-cacheStartedIds"
    label: {zh: "读 _candidateStateCac", en: "read _candidateStateCac"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:candidate-state-cache-93c7ac3d:read-demandPerTickEstimate"
    label: {zh: "读 _candidateStateCac", en: "read _candidateStateCac"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:candidate-state-cache-93c7ac3d:read-candidateStateFor"
    label: {zh: "读 _candidateStateCac", en: "read _candidateStateCac"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:candidate-state-cache-93c7ac3d:read-__restore"
    label: {zh: "读 _candidateStateCac", en: "read _candidateStateCac"}
---
