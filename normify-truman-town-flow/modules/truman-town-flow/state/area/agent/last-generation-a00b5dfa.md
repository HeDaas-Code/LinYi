---
uid: 5589c57e
id: truman-town-flow.state.area.agent.last-generation-a00b5dfa
parent: truman-town-flow.state.area.agent
name: {zh: "lastGeneration", en: "lastGeneration"}
description:
  zh: >
      number 类型，声明于 src/agent/psyche/trauma.js:26。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/agent/psyche/trauma.js:26; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:51.765Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-generation-a00b5dfa:write-ensureFresh"
    description:
      zh: >
          写入方 ensureFresh（src/agent/psyche/trauma.js）
          
      en: >
          writer ensureFresh
          
  - protocol: rpc
    path: "last-generation-a00b5dfa:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/psyche/trauma.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "last-generation-a00b5dfa:read-ensureFresh"
    description:
      zh: >
          读取方 ensureFresh
          
      en: >
          reader ensureFresh
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:last-generation-a00b5dfa:read-ensureFresh"
    label: {zh: "读 lastGeneration", en: "read lastGeneration"}
---
