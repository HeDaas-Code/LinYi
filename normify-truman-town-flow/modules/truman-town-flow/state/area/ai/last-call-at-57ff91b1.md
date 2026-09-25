---
uid: 6a697599
id: truman-town-flow.state.area.ai.last-call-at-57ff91b1
parent: truman-town-flow.state.area.ai
name: {zh: "lastCallAt", en: "lastCallAt"}
description:
  zh: >
      number 类型，声明于 src/ai/llm/gateway.js:81。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/ai/llm/gateway.js:81; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:33.450Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-call-at-57ff91b1:write-throttle"
    description:
      zh: >
          写入方 throttle（src/ai/llm/gateway.js）
          
      en: >
          writer throttle
          
  - protocol: rpc
    path: "last-call-at-57ff91b1:read-throttle"
    description:
      zh: >
          读取方 throttle
          
      en: >
          reader throttle
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.ai.llm.gateway
    from_api: "rpc:last-call-at-57ff91b1:read-throttle"
    label: {zh: "读 lastCallAt", en: "read lastCallAt"}
---
