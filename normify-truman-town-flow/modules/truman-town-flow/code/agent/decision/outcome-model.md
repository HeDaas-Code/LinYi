---
uid: d4d7c102
id: truman-town-flow.code.agent.decision.outcome-model
parent: truman-town-flow.code.agent.decision
name: {zh: "agent/decision/outcome-model.js", en: "agent/decision/outcome-model.js"}
description:
  zh: >
      代码模块 src/agent/decision/outcome-model.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/decision/outcome-model.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:28.315Z"
fingerprint: 1d4e8472f1d670c783ae40a6cab67fbfd7899ad810aff62b298e55804bdd13c2
source:
  - path: "src/agent/decision/outcome-model.js"
apis:
  - protocol: rpc
    path: "agent.decision.outcome-model.keyOf"
    description:
      zh: >
          keyOf：模块导出函数。
          
      en: >
          keyOf: exported module function.
          
  - protocol: rpc
    path: "agent.decision.outcome-model.rewardOf"
    description:
      zh: >
          rewardOf：模块导出函数。
          
      en: >
          rewardOf: exported module function.
          
  - protocol: rpc
    path: "agent.decision.outcome-model.observe"
    description:
      zh: >
          observe：模块导出函数。
          
      en: >
          observe: exported module function.
          
  - protocol: rpc
    path: "agent.decision.outcome-model.estimate"
    description:
      zh: >
          estimate：模块导出函数。
          
      en: >
          estimate: exported module function.
          
  - protocol: rpc
    path: "agent.decision.outcome-model.bias"
    description:
      zh: >
          bias：模块导出函数。
          
      en: >
          bias: exported module function.
          
  - protocol: rpc
    path: "agent.decision.outcome-model.size"
    description:
      zh: >
          size：模块导出函数。
          
      en: >
          size: exported module function.
          
  - protocol: rpc
    path: "agent.decision.outcome-model.stats"
    description:
      zh: >
          stats：模块导出函数。
          
      en: >
          stats: exported module function.
          
  - protocol: rpc
    path: "agent.decision.outcome-model.snapshot"
    description:
      zh: >
          snapshot：模块导出函数。
          
      en: >
          snapshot: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.table-e9467aa6
    to_api: "rpc:table-e9467aa6:write-touch"
    label: {zh: "写 table", en: "write table"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.table-e9467aa6
    to_api: "rpc:table-e9467aa6:write-observe"
    label: {zh: "写 table", en: "write table"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.lru-c1c7a3b7
    to_api: "rpc:lru-c1c7a3b7:write-touch"
    label: {zh: "写 lru", en: "write lru"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.lru-seq-4ff8632e
    to_api: "rpc:lru-seq-4ff8632e:write-touch"
    label: {zh: "写 lruSeq", en: "write lruSeq"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.observations-6b560735
    to_api: "rpc:observations-6b560735:write-observe"
    label: {zh: "写 observations", en: "write observations"}
---
