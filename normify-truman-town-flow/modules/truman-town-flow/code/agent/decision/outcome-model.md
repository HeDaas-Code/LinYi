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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis: []
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
