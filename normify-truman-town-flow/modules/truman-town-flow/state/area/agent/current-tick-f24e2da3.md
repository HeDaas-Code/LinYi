---
uid: ead13022
id: truman-town-flow.state.area.agent.current-tick-f24e2da3
parent: truman-town-flow.state.area.agent
name: {zh: "currentTick", en: "currentTick"}
description:
  zh: >
      null 类型，声明于 src/agent/decision/contention.js:32。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      null declared at src/agent/decision/contention.js:32; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "current-tick-f24e2da3:write-open"
    description:
      zh: >
          写入方 open（src/agent/decision/contention.js）
          
      en: >
          writer open
          
  - protocol: rpc
    path: "current-tick-f24e2da3:read-tickOf"
    description:
      zh: >
          读取方 tickOf
          
      en: >
          reader tickOf
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:current-tick-f24e2da3:read-tickOf"
    label: {zh: "读 currentTick", en: "read currentTick"}
---
