---
uid: 15dce3e2
id: truman-town-flow.state.area.agent.opened-5b42f98c
parent: truman-town-flow.state.area.agent
name: {zh: "opened", en: "opened"}
description:
  zh: >
      flag 类型，声明于 src/agent/decision/contention.js:33。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      flag declared at src/agent/decision/contention.js:33; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "opened-5b42f98c:write-open"
    description:
      zh: >
          写入方 open（src/agent/decision/contention.js）
          
      en: >
          writer open
          
  - protocol: rpc
    path: "opened-5b42f98c:read-isOpen"
    description:
      zh: >
          读取方 isOpen
          
      en: >
          reader isOpen
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:opened-5b42f98c:read-isOpen"
    label: {zh: "读 opened", en: "read opened"}
---
