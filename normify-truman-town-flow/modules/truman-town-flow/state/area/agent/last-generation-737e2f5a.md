---
uid: b007509d
id: truman-town-flow.state.area.agent.last-generation-737e2f5a
parent: truman-town-flow.state.area.agent
name: {zh: "lastGeneration", en: "lastGeneration"}
description:
  zh: >
      number 类型，声明于 src/agent/memory/episodic/store.js:25。写入方 2 个、读取方 1 个；**未纳入复位**（跨 run 可能残留）。
      
  en: >
      number declared at src/agent/memory/episodic/store.js:25; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-generation-737e2f5a:write-ensureFresh"
    description:
      zh: >
          写入方 ensureFresh（src/agent/memory/episodic/store.js）
          
      en: >
          writer ensureFresh
          
  - protocol: rpc
    path: "last-generation-737e2f5a:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/memory/episodic/store.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "last-generation-737e2f5a:read-ensureFresh"
    description:
      zh: >
          读取方 ensureFresh
          
      en: >
          reader ensureFresh
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:last-generation-737e2f5a:read-ensureFresh"
    label: {zh: "读 lastGeneration", en: "read lastGeneration"}
---
