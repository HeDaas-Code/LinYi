---
uid: 254a4b93
id: truman-town-flow.code.agent.decision.contention
parent: truman-town-flow.code.agent.decision
name: {zh: "agent/decision/contention.js", en: "agent/decision/contention.js"}
description:
  zh: >
      代码模块 src/agent/decision/contention.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/decision/contention.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.pools-1c7d56f4
    to_api: "rpc:pools-1c7d56f4:write-open"
    label: {zh: "写 pools", en: "write pools"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.current-tick-f24e2da3
    to_api: "rpc:current-tick-f24e2da3:write-open"
    label: {zh: "写 currentTick", en: "write currentTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.opened-5b42f98c
    to_api: "rpc:opened-5b42f98c:write-open"
    label: {zh: "写 opened", en: "write opened"}
  - kind: dataflow
    to: truman-town-flow.state.area.economy.treasury-account-id-076bfbd7
    to_api: "rpc:treasury-account-id-076bfbd7:write-open"
    label: {zh: "写 treasuryAccountId", en: "write treasuryAccountId"}
  - kind: dataflow
    to: truman-town-flow.state.area.economy.pool-account-id-dfd57156
    to_api: "rpc:pool-account-id-dfd57156:write-open"
    label: {zh: "写 poolAccountId", en: "write poolAccountId"}
---
