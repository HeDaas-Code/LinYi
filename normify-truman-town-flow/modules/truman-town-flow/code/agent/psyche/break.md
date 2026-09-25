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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
fingerprint: pending
source: []
apis: []
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
