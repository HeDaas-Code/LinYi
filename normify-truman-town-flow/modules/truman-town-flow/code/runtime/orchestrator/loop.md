---
uid: 54ed653b
id: truman-town-flow.code.runtime.orchestrator.loop
parent: truman-town-flow.code.runtime.orchestrator
name: {zh: "runtime/orchestrator/loop.js", en: "runtime/orchestrator/loop.js"}
description:
  zh: >
      主循环负责单 tick 阶段编排、决策与提交边界管理。
      
  en: >
      Coordinates per-tick stages, decisions, and commit boundaries.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:42:20.961Z"
fingerprint: 56d12036a82066b75d5b666272f28a7ed110363e85c8b8bd901ea88039d383ac
source:
  - path: "src/runtime/orchestrator/loop.js"
apis:
  - protocol: rpc
    path: "runtime.orchestrator.loop.setIntervention"
    description:
      zh: >
          setIntervention：主循环公开的运行时接口。
          
      en: >
          setIntervention: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.interventionStatus"
    description:
      zh: >
          interventionStatus：主循环公开的运行时接口。
          
      en: >
          interventionStatus: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.foragePoolRemaining"
    description:
      zh: >
          foragePoolRemaining：主循环公开的运行时接口。
          
      en: >
          foragePoolRemaining: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.generationStatus"
    description:
      zh: >
          generationStatus：主循环公开的运行时接口。
          
      en: >
          generationStatus: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.legacyStatus"
    description:
      zh: >
          legacyStatus：主循环公开的运行时接口。
          
      en: >
          legacyStatus: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.spawnAgent"
    description:
      zh: >
          spawnAgent：主循环公开的运行时接口。
          
      en: >
          spawnAgent: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.tickSequence"
    description:
      zh: >
          tickSequence：主循环公开的运行时接口。
          
      en: >
          tickSequence: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.step"
    description:
      zh: >
          step：主循环公开的运行时接口。
          
      en: >
          step: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.run"
    description:
      zh: >
          run：主循环公开的运行时接口。
          
      en: >
          run: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.resume"
    description:
      zh: >
          resume：主循环公开的运行时接口。
          
      en: >
          resume: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.snapshot"
    description:
      zh: >
          snapshot：主循环公开的运行时接口。
          
      en: >
          snapshot: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.markRestored"
    description:
      zh: >
          markRestored：主循环公开的运行时接口。
          
      en: >
          markRestored: public orchestrator runtime API.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.tickStatus"
    description:
      zh: >
          tickStatus：主循环公开的运行时接口。
          
      en: >
          tickStatus: public orchestrator runtime API.
          
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
