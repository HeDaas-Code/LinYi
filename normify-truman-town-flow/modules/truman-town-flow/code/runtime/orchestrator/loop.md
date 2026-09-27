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
      
revision: d274800fb7ef2a36072ec55a91e20ac867835ce0
updated_at: "2026-09-27T20:52:52.425Z"
fingerprint: f5f7e70eb62f2bd3d6aaa8bd7e4fcd95ba636a6587fb1b212ff0f79b1de6a74a
source:
  - path: "src/runtime/orchestrator/loop.js"
  - path: "src/runtime/orchestrator/_stage2.js"
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.laya-urgency-cache-41855253
    to_api: "rpc:laya-urgency-cache-41855253:write-prefetchLayaUrgency"
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
    to: truman-town-flow.state.area.runtime.in-flight-53dcc34c
    to_api: "rpc:in-flight-53dcc34c:write-markRestored"
    label: {zh: "写 inFlight", en: "write inFlight"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.committed-tick-5c00f420
    to_api: "rpc:committed-tick-5c00f420:write-markRestored"
    label: {zh: "写 committedTick", en: "write committedTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.in-flight-tick-d0b17941
    to_api: "rpc:in-flight-tick-d0b17941:write-markRestored"
    label: {zh: "写 inFlightTick", en: "write inFlightTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.stage-error-f79c4049
    to_api: "rpc:stage-error-f79c4049:write-markRestored"
    label: {zh: "写 stageError", en: "write stageError"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.stage-failure-94c90399
    to_api: "rpc:stage-failure-94c90399:write-markRestored"
    label: {zh: "写 stageFailure", en: "write stageFailure"}
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
    to: truman-town-flow.state.area.runtime.literate-set-72b44b99
    to_api: "rpc:literate-set-72b44b99:write-computeLiterateSet"
    label: {zh: "写 literateSet", en: "write literateSet"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.mortality-4ab46b0e
    to_api: "rpc:mortality-4ab46b0e:write-runMortality"
    label: {zh: "写 mortality", en: "write mortality"}
---
