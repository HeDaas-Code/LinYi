---
uid: d1f1fa66
id: truman-town-flow.state.area.agent.broken-agents-749c1570
parent: truman-town-flow.state.area.agent
name: {zh: "brokenAgents", en: "brokenAgents"}
description:
  zh: >
      set 类型，声明于 src/agent/psyche/break.js:17。写入方 2 个、读取方 4 个；已纳入复位。
      
  en: >
      set declared at src/agent/psyche/break.js:17; writers=2, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:31.618Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "broken-agents-749c1570:write-trigger"
    description:
      zh: >
          写入方 trigger（src/agent/psyche/break.js）
          
      en: >
          writer trigger
          
  - protocol: rpc
    path: "broken-agents-749c1570:write-recover"
    description:
      zh: >
          写入方 recover（src/agent/psyche/break.js）
          
      en: >
          writer recover
          
  - protocol: rpc
    path: "broken-agents-749c1570:read-check"
    description:
      zh: >
          读取方 check
          
      en: >
          reader check
          
  - protocol: rpc
    path: "broken-agents-749c1570:read-trigger"
    description:
      zh: >
          读取方 trigger
          
      en: >
          reader trigger
          
  - protocol: rpc
    path: "broken-agents-749c1570:read-recover"
    description:
      zh: >
          读取方 recover
          
      en: >
          reader recover
          
  - protocol: rpc
    path: "broken-agents-749c1570:read-decisionModifier"
    description:
      zh: >
          读取方 decisionModifier
          
      en: >
          reader decisionModifier
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.psyche.break
    from_api: "rpc:broken-agents-749c1570:read-check"
    label: {zh: "读 brokenAgents", en: "read brokenAgents"}
  - kind: dataflow
    to: truman-town-flow.code.agent.psyche.break
    from_api: "rpc:broken-agents-749c1570:read-trigger"
    label: {zh: "读 brokenAgents", en: "read brokenAgents"}
  - kind: dataflow
    to: truman-town-flow.code.agent.psyche.break
    from_api: "rpc:broken-agents-749c1570:read-recover"
    label: {zh: "读 brokenAgents", en: "read brokenAgents"}
  - kind: dataflow
    to: truman-town-flow.code.agent.psyche.break
    from_api: "rpc:broken-agents-749c1570:read-decisionModifier"
    label: {zh: "读 brokenAgents", en: "read brokenAgents"}
---
