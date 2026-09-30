---
uid: eea9f76a
id: truman-town-flow.state.area.runtime.settled-agent-ids-6dcf86b2
parent: truman-town-flow.state.area.runtime
name: {zh: "settledAgentIds", en: "settledAgentIds"}
description:
  zh: >
      array 类型，声明于 src/runtime/orchestrator/_stage2.js:77。写入方 1 个、读取方 4 个；已纳入复位。
      
  en: >
      array declared at src/runtime/orchestrator/_stage2.js:77; writers=1, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.231Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "settled-agent-ids-6dcf86b2:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
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
          
  - protocol: rpc
    path: "settled-agent-ids-6dcf86b2:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
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
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:settled-agent-ids-6dcf86b2:read-__snapshot"
    label: {zh: "读 settledAgentIds", en: "read settledAgentIds"}
---
