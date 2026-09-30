---
uid: a0e16808
id: truman-town-flow.state.area.social.last-generation-b243beda
parent: truman-town-flow.state.area.social
name: {zh: "lastGeneration", en: "lastGeneration"}
description:
  zh: >
      number 类型，声明于 src/social/platform/posts.js:35。写入方 2 个、读取方 1 个；**未纳入复位**（跨 run 可能残留）。
      
  en: >
      number declared at src/social/platform/posts.js:35; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-generation-b243beda:write-ensureFresh"
    description:
      zh: >
          写入方 ensureFresh（src/social/platform/posts.js）
          
      en: >
          writer ensureFresh
          
  - protocol: rpc
    path: "last-generation-b243beda:write-__restore"
    description:
      zh: >
          写入方 __restore（src/social/platform/posts.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "last-generation-b243beda:read-ensureFresh"
    description:
      zh: >
          读取方 ensureFresh
          
      en: >
          reader ensureFresh
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:last-generation-b243beda:read-ensureFresh"
    label: {zh: "读 lastGeneration", en: "read lastGeneration"}
---
