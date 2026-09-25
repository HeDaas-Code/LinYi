---
uid: eea9f76a
id: truman-town-flow.state.area.runtime.settled-agent-ids-6dcf86b2
parent: truman-town-flow.state.area.runtime
name: {zh: "settledAgentIds", en: "settledAgentIds"}
description:
  zh: >
      array 类型，声明于 src/runtime/orchestrator/_stage2.js:67。写入方 1 个、读取方 3 个；已纳入复位。
      
  en: >
      array declared at src/runtime/orchestrator/_stage2.js:67; writers=1, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:38.768Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "settled-agent-ids-6dcf86b2:write-tick"
    description:
      zh: >
          写入方 tick（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer tick
          
  - protocol: rpc
    path: "settled-agent-ids-6dcf86b2:read-candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
          
      en: >
          reader candidateStateFor
          
  - protocol: rpc
    path: "settled-agent-ids-6dcf86b2:read-pickMate"
    description:
      zh: >
          读取方 pickMate
          
      en: >
          reader pickMate
          
  - protocol: rpc
    path: "settled-agent-ids-6dcf86b2:read-pickPeer"
    description:
      zh: >
          读取方 pickPeer
          
      en: >
          reader pickPeer
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:settled-agent-ids-6dcf86b2:read-candidateStateFor"
    label: {zh: "读 settledAgentIds", en: "read settledAgentIds"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:settled-agent-ids-6dcf86b2:read-pickMate"
    label: {zh: "读 settledAgentIds", en: "read settledAgentIds"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:settled-agent-ids-6dcf86b2:read-pickPeer"
    label: {zh: "读 settledAgentIds", en: "read settledAgentIds"}
---
