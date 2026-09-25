---
uid: "56412909"
id: truman-town-flow.code.agent.memory.semantic
parent: truman-town-flow.code.agent.memory
name: {zh: "agent/memory/semantic.js", en: "agent/memory/semantic.js"}
description:
  zh: >
      代码模块 src/agent/memory/semantic.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/memory/semantic.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.by-agent-eca3003b
    to_api: "rpc:by-agent-eca3003b:write-store"
    label: {zh: "写 byAgent", en: "write byAgent"}
---
