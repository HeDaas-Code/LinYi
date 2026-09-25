---
uid: e259758e
id: truman-town-flow.state.area.runtime.candidate-state-cache-93c7ac3d
parent: truman-town-flow.state.area.runtime
name: {zh: "_candidateStateCache", en: "_candidateStateCache"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage2.js:761。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage2.js:761; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
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
    path: "candidate-state-cache-93c7ac3d:write-tick"
    description:
      zh: >
          写入方 tick（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer tick
          
  - protocol: rpc
    path: "candidate-state-cache-93c7ac3d:read-candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
          
      en: >
          reader candidateStateFor
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:candidate-state-cache-93c7ac3d:read-candidateStateFor"
    label: {zh: "读 _candidateStateCac", en: "read _candidateStateCac"}
---
