---
uid: 1ee7a769
id: truman-town-flow.code.agent.psyche.break
parent: truman-town-flow.code.agent.psyche
name: {zh: "agent/psyche/break.js", en: "agent/psyche/break.js"}
description:
  zh: >
      代码模块 src/agent/psyche/break.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/psyche/break.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:33.171Z"
fingerprint: 2f5d89e2d118367076585ac043d0899f3e5615060b5363354a6f4dae7015c27b
source:
  - path: "src/agent/psyche/break.js"
apis:
  - protocol: rpc
    path: "agent.psyche.break.check"
    description:
      zh: >
          check：模块导出函数。
          
      en: >
          check: exported module function.
          
  - protocol: rpc
    path: "agent.psyche.break.trigger"
    description:
      zh: >
          trigger：模块导出函数。
          
      en: >
          trigger: exported module function.
          
  - protocol: rpc
    path: "agent.psyche.break.recover"
    description:
      zh: >
          recover：模块导出函数。
          
      en: >
          recover: exported module function.
          
  - protocol: rpc
    path: "agent.psyche.break.decisionModifier"
    description:
      zh: >
          decisionModifier：模块导出函数。
          
      en: >
          decisionModifier: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.broken-agents-749c1570
    to_api: "rpc:broken-agents-749c1570:write-trigger"
    label: {zh: "写 brokenAgents", en: "write brokenAgents"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.broken-agents-749c1570
    to_api: "rpc:broken-agents-749c1570:write-recover"
    label: {zh: "写 brokenAgents", en: "write brokenAgents"}
---
