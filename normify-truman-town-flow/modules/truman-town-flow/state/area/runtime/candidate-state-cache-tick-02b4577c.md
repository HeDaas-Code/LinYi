---
uid: 487be863
id: truman-town-flow.state.area.runtime.candidate-state-cache-tick-02b4577c
parent: truman-town-flow.state.area.runtime
name: {zh: "_candidateStateCacheTick", en: "_candidateStateCacheTick"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:762。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:762; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "candidate-state-cache-tick-02b4577c:write-candidateStateFor"
    description:
      zh: >
          写入方 candidateStateFor（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer candidateStateFor
          
  - protocol: rpc
    path: "candidate-state-cache-tick-02b4577c:read-candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
          
      en: >
          reader candidateStateFor
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:candidate-state-cache-tick-02b4577c:read-candidateStateFor"
    label: {zh: "读 _candidateStateCac", en: "read _candidateStateCac"}
---
