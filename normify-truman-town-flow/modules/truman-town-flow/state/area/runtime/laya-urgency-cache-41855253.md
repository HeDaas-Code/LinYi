---
uid: f490d8f2
id: truman-town-flow.state.area.runtime.laya-urgency-cache-41855253
parent: truman-town-flow.state.area.runtime
name: {zh: "layaUrgencyCache", en: "layaUrgencyCache"}
description:
  zh: >
      map 类型，声明于 src/runtime/orchestrator/loop.js:76。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      map declared at src/runtime/orchestrator/loop.js:76; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "laya-urgency-cache-41855253:write-prefetchLayaUrgency"
    description:
      zh: >
          写入方 prefetchLayaUrgency（src/runtime/orchestrator/loop.js）
          
      en: >
          writer prefetchLayaUrgency
          
  - protocol: rpc
    path: "laya-urgency-cache-41855253:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/loop.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "laya-urgency-cache-41855253:read-layaUrgencyFor"
    description:
      zh: >
          读取方 layaUrgencyFor
          
      en: >
          reader layaUrgencyFor
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:laya-urgency-cache-41855253:read-layaUrgencyFor"
    label: {zh: "读 layaUrgencyCache", en: "read layaUrgencyCache"}
---
