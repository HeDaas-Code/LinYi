---
uid: a7da6d37
id: truman-town-flow.state.area.agent.active-coping-22d99f84
parent: truman-town-flow.state.area.agent
name: {zh: "activeCoping", en: "activeCoping"}
description:
  zh: >
      map 类型，声明于 src/agent/psyche/coping.js:23。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      map declared at src/agent/psyche/coping.js:23; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:31.618Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "active-coping-22d99f84:write-execute"
    description:
      zh: >
          写入方 execute（src/agent/psyche/coping.js）
          
      en: >
          writer execute
          
  - protocol: rpc
    path: "active-coping-22d99f84:read-decisionWeights"
    description:
      zh: >
          读取方 decisionWeights
          
      en: >
          reader decisionWeights
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.psyche.coping
    from_api: "rpc:active-coping-22d99f84:read-decisionWeights"
    label: {zh: "读 activeCoping", en: "read activeCoping"}
---
