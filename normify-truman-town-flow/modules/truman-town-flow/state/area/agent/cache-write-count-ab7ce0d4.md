---
uid: b24e4d14
id: truman-town-flow.state.area.agent.cache-write-count-ab7ce0d4
parent: truman-town-flow.state.area.agent
name: {zh: "cacheWriteCount", en: "cacheWriteCount"}
description:
  zh: >
      number 类型，声明于 src/agent/persona/personality.js:54。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/agent/persona/personality.js:54; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:31.618Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "cache-write-count-ab7ce0d4:write-ensureCacheFresh"
    description:
      zh: >
          写入方 ensureCacheFresh（src/agent/persona/personality.js）
          
      en: >
          writer ensureCacheFresh
          
  - protocol: rpc
    path: "cache-write-count-ab7ce0d4:read-ensureCacheFresh"
    description:
      zh: >
          读取方 ensureCacheFresh
          
      en: >
          reader ensureCacheFresh
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.persona.personality
    from_api: "rpc:cache-write-count-ab7ce0d4:read-ensureCacheFresh"
    label: {zh: "读 cacheWriteCount", en: "read cacheWriteCount"}
---
