---
uid: e183541d
id: truman-town-flow.state.area.agent.lru-seq-4ff8632e
parent: truman-town-flow.state.area.agent
name: {zh: "lruSeq", en: "lruSeq"}
description:
  zh: >
      number 类型，声明于 src/agent/decision/outcome-model.js:36。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/agent/decision/outcome-model.js:36; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "lru-seq-4ff8632e:write-touch"
    description:
      zh: >
          写入方 touch（src/agent/decision/outcome-model.js）
          
      en: >
          writer touch
          
  - protocol: rpc
    path: "lru-seq-4ff8632e:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/decision/outcome-model.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "lru-seq-4ff8632e:read-touch"
    description:
      zh: >
          读取方 touch
          
      en: >
          reader touch
          
  - protocol: rpc
    path: "lru-seq-4ff8632e:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.outcome-model
    from_api: "rpc:lru-seq-4ff8632e:read-touch"
    label: {zh: "读 lruSeq", en: "read lruSeq"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:lru-seq-4ff8632e:read-__snapshot"
    label: {zh: "读 lruSeq", en: "read lruSeq"}
---
