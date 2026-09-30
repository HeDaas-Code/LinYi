---
uid: ee73de0c
id: truman-town-flow.code.agent.persona.personality
parent: truman-town-flow.code.agent.persona
name: {zh: "agent/persona/personality.js", en: "agent/persona/personality.js"}
description:
  zh: >
      代码模块 src/agent/persona/personality.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/persona/personality.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:32.451Z"
fingerprint: d6a53c5c57f8f0c876645022b3d9552538983a5befcee363ee781f348fdeb0e4
source:
  - path: "src/agent/persona/personality.js"
apis:
  - protocol: rpc
    path: "agent.persona.personality.profile"
    description:
      zh: >
          profile：模块导出函数。
          
      en: >
          profile: exported module function.
          
  - protocol: rpc
    path: "agent.persona.personality.evaluate"
    description:
      zh: >
          evaluate：模块导出函数。
          
      en: >
          evaluate: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.profile-cache-5519d265
    to_api: "rpc:profile-cache-5519d265:write-ensureCacheFresh"
    label: {zh: "写 profileCache", en: "write profileCache"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.profile-cache-5519d265
    to_api: "rpc:profile-cache-5519d265:write-profile"
    label: {zh: "写 profileCache", en: "write profileCache"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.cache-write-count-ab7ce0d4
    to_api: "rpc:cache-write-count-ab7ce0d4:write-ensureCacheFresh"
    label: {zh: "写 cacheWriteCount", en: "write cacheWriteCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.cache-graph-gen-c04a7350
    to_api: "rpc:cache-graph-gen-c04a7350:write-ensureCacheFresh"
    label: {zh: "写 cacheGraphGen", en: "write cacheGraphGen"}
---
