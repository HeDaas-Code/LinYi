---
uid: 54ed653b
id: truman-town-flow.code.runtime.orchestrator.loop
parent: truman-town-flow.code.runtime.orchestrator
name: {zh: "runtime/orchestrator/loop.js", en: "runtime/orchestrator/loop.js"}
description:
  zh: >
      代码模块 src/runtime/orchestrator/loop.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/orchestrator/loop.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:48.777Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.laya-urgency-cache-41855253
    to_api: "rpc:laya-urgency-cache-41855253:write-prefetchLayaUrgency"
    label: {zh: "写 layaUrgencyCache", en: "write layaUrgencyCache"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.laya-urgency-cache-41855253
    to_api: "rpc:laya-urgency-cache-41855253:write-step"
    label: {zh: "写 layaUrgencyCache", en: "write layaUrgencyCache"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.forage-pool-5d0cee59
    to_api: "rpc:forage-pool-5d0cee59:write-regenForagePool"
    label: {zh: "写 foragePool", en: "write foragePool"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.forage-pool-5d0cee59
    to_api: "rpc:forage-pool-5d0cee59:write-effectFor"
    label: {zh: "写 foragePool", en: "write foragePool"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.alive-pop-generation-4e04a804
    to_api: "rpc:alive-pop-generation-4e04a804:write-invalidateAlivePopulation"
    label: {zh: "写 _alivePopGeneratio", en: "write _alivePopGeneratio"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.alive-pop-generation-4e04a804
    to_api: "rpc:alive-pop-generation-4e04a804:write-alivePopulation"
    label: {zh: "写 _alivePopGeneratio", en: "write _alivePopGeneratio"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.alive-pop-value-a60f77b3
    to_api: "rpc:alive-pop-value-a60f77b3:write-alivePopulation"
    label: {zh: "写 _alivePopValue", en: "write _alivePopValue"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.mortality-4ab46b0e
    to_api: "rpc:mortality-4ab46b0e:write-runMortality"
    label: {zh: "写 mortality", en: "write mortality"}
---
