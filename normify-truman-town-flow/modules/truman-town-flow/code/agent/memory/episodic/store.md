---
uid: f0526fac
id: truman-town-flow.code.agent.memory.episodic.store
parent: truman-town-flow.code.agent.memory.episodic
name: {zh: "agent/memory/episodic/store.js", en: "agent/memory/episodic/store.js"}
description:
  zh: >
      代码模块 src/agent/memory/episodic/store.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/memory/episodic/store.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.by-agent-86ec5f42
    to_api: "rpc:by-agent-86ec5f42:write-ensureFresh"
    label: {zh: "写 byAgent", en: "write byAgent"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.by-agent-86ec5f42
    to_api: "rpc:by-agent-86ec5f42:write-write"
    label: {zh: "写 byAgent", en: "write byAgent"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.last-generation-737e2f5a
    to_api: "rpc:last-generation-737e2f5a:write-ensureFresh"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.by-agent-eca3003b
    to_api: "rpc:by-agent-eca3003b:write-ensureFresh"
    label: {zh: "写 byAgent", en: "write byAgent"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.last-generation-4f7f9071
    to_api: "rpc:last-generation-4f7f9071:write-ensureFresh"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.events-by-agent-63e338fd
    to_api: "rpc:events-by-agent-63e338fd:write-ensureFresh"
    label: {zh: "写 eventsByAgent", en: "write eventsByAgent"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.last-generation-a00b5dfa
    to_api: "rpc:last-generation-a00b5dfa:write-ensureFresh"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.nodes-231cb4f7
    to_api: "rpc:nodes-231cb4f7:write-write"
    label: {zh: "写 nodes", en: "write nodes"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.by-type-49f64b03
    to_api: "rpc:by-type-49f64b03:write-write"
    label: {zh: "写 byType", en: "write byType"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.by-id-fde1e42c
    to_api: "rpc:by-id-fde1e42c:write-ensureFresh"
    label: {zh: "写 byId", en: "write byId"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.last-generation-b243beda
    to_api: "rpc:last-generation-b243beda:write-ensureFresh"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.by-agent-2dd1f55b
    to_api: "rpc:by-agent-2dd1f55b:write-ensureFresh"
    label: {zh: "写 byAgent", en: "write byAgent"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.last-generation-a3b1fa91
    to_api: "rpc:last-generation-a3b1fa91:write-ensureFresh"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
---
