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
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:31.471Z"
fingerprint: df03a7b7e9732693efe8b8e7f1b6748d623042b17d6f8e083c545a71c904b241
source:
  - path: "src/agent/memory/semantic.js"
apis:
  - protocol: rpc
    path: "agent.memory.semantic.store"
    description:
      zh: >
          store：模块导出函数。
          
      en: >
          store: exported module function.
          
  - protocol: rpc
    path: "agent.memory.semantic.list"
    description:
      zh: >
          list：模块导出函数。
          
      en: >
          list: exported module function.
          
  - protocol: rpc
    path: "agent.memory.semantic.recall"
    description:
      zh: >
          recall：模块导出函数。
          
      en: >
          recall: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.by-agent-eca3003b
    to_api: "rpc:by-agent-eca3003b:write-store"
    label: {zh: "写 byAgent", en: "write byAgent"}
---
