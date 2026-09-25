---
uid: 7ca0c199
id: truman-town-flow.state.area.agent.cache-graph-gen-c04a7350
parent: truman-town-flow.state.area.agent
name: {zh: "cacheGraphGen", en: "cacheGraphGen"}
description:
  zh: >
      number 类型，声明于 src/agent/persona/personality.js:55。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/agent/persona/personality.js:55; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:31.618Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "cache-graph-gen-c04a7350:write-ensureCacheFresh"
    description:
      zh: >
          写入方 ensureCacheFresh（src/agent/persona/personality.js）
          
      en: >
          writer ensureCacheFresh
          
  - protocol: rpc
    path: "cache-graph-gen-c04a7350:read-ensureCacheFresh"
    description:
      zh: >
          读取方 ensureCacheFresh
          
      en: >
          reader ensureCacheFresh
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.persona.personality
    from_api: "rpc:cache-graph-gen-c04a7350:read-ensureCacheFresh"
    label: {zh: "读 cacheGraphGen", en: "read cacheGraphGen"}
---
