---
uid: e0de03cd
id: truman-town-flow.state.area.agent.pools-1c7d56f4
parent: truman-town-flow.state.area.agent
name: {zh: "pools", en: "pools"}
description:
  zh: >
      map 类型，声明于 src/agent/decision/contention.js:31。写入方 1 个、读取方 4 个；已纳入复位。
      
  en: >
      map declared at src/agent/decision/contention.js:31; writers=1, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "pools-1c7d56f4:write-open"
    description:
      zh: >
          写入方 open（src/agent/decision/contention.js）
          
      en: >
          writer open
          
  - protocol: rpc
    path: "pools-1c7d56f4:read-remaining"
    description:
      zh: >
          读取方 remaining
          
      en: >
          reader remaining
          
  - protocol: rpc
    path: "pools-1c7d56f4:read-reserve"
    description:
      zh: >
          读取方 reserve
          
      en: >
          reader reserve
          
  - protocol: rpc
    path: "pools-1c7d56f4:read-view"
    description:
      zh: >
          读取方 view
          
      en: >
          reader view
          
  - protocol: rpc
    path: "pools-1c7d56f4:read-snapshot"
    description:
      zh: >
          读取方 snapshot
          
      en: >
          reader snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:pools-1c7d56f4:read-remaining"
    label: {zh: "读 pools", en: "read pools"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:pools-1c7d56f4:read-reserve"
    label: {zh: "读 pools", en: "read pools"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:pools-1c7d56f4:read-view"
    label: {zh: "读 pools", en: "read pools"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:pools-1c7d56f4:read-snapshot"
    label: {zh: "读 pools", en: "read pools"}
---
