---
uid: 91798eb4
id: truman-town-flow.code.agent.psyche.trauma
parent: truman-town-flow.code.agent.psyche
name: {zh: "agent/psyche/trauma.js", en: "agent/psyche/trauma.js"}
description:
  zh: >
      代码模块 src/agent/psyche/trauma.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/psyche/trauma.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:34.659Z"
fingerprint: b9840a8ecd012cb22862c4afab5f5eb6148ae2614b47cf82ba88e8632deb434c
source:
  - path: "src/agent/psyche/trauma.js"
apis:
  - protocol: rpc
    path: "agent.psyche.trauma.add"
    description:
      zh: >
          add：模块导出函数。
          
      en: >
          add: exported module function.
          
  - protocol: rpc
    path: "agent.psyche.trauma.query"
    description:
      zh: >
          query：模块导出函数。
          
      en: >
          query: exported module function.
          
  - protocol: rpc
    path: "agent.psyche.trauma.heal"
    description:
      zh: >
          heal：模块导出函数。
          
      en: >
          heal: exported module function.
          
  - protocol: rpc
    path: "agent.psyche.trauma.accumulate"
    description:
      zh: >
          accumulate：模块导出函数。
          
      en: >
          accumulate: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.events-by-agent-63e338fd
    to_api: "rpc:events-by-agent-63e338fd:write-save"
    label: {zh: "写 eventsByAgent", en: "write eventsByAgent"}
---
