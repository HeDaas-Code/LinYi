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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:20.282Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.events-by-agent-63e338fd
    to_api: "rpc:events-by-agent-63e338fd:write-save"
    label: {zh: "写 eventsByAgent", en: "write eventsByAgent"}
---
