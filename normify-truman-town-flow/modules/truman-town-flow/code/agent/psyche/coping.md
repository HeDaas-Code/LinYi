---
uid: ac74cb0c
id: truman-town-flow.code.agent.psyche.coping
parent: truman-town-flow.code.agent.psyche
name: {zh: "agent/psyche/coping.js", en: "agent/psyche/coping.js"}
description:
  zh: >
      代码模块 src/agent/psyche/coping.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/psyche/coping.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:33.919Z"
fingerprint: 70213be2bcc1f2dd8ac9f23e4500e884748d00a1fe8029d6e88fcc7418c3671e
source:
  - path: "src/agent/psyche/coping.js"
apis:
  - protocol: rpc
    path: "agent.psyche.coping.choose"
    description:
      zh: >
          choose：模块导出函数。
          
      en: >
          choose: exported module function.
          
  - protocol: rpc
    path: "agent.psyche.coping.execute"
    description:
      zh: >
          execute：模块导出函数。
          
      en: >
          execute: exported module function.
          
  - protocol: rpc
    path: "agent.psyche.coping.decisionWeights"
    description:
      zh: >
          decisionWeights：模块导出函数。
          
      en: >
          decisionWeights: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.active-coping-22d99f84
    to_api: "rpc:active-coping-22d99f84:write-execute"
    label: {zh: "写 activeCoping", en: "write activeCoping"}
---
