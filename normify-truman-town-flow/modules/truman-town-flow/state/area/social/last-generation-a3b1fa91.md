---
uid: "44275409"
id: truman-town-flow.state.area.social.last-generation-a3b1fa91
parent: truman-town-flow.state.area.social
name: {zh: "lastGeneration", en: "lastGeneration"}
description:
  zh: >
      number 类型，声明于 src/social/reputation.js:46。写入方 1 个、读取方 1 个；**未纳入复位**（跨 run 可能残留）。
      
  en: >
      number declared at src/social/reputation.js:46; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-generation-a3b1fa91:write-ensureFresh"
    description:
      zh: >
          写入方 ensureFresh（src/social/reputation.js）
          
      en: >
          writer ensureFresh
          
  - protocol: rpc
    path: "last-generation-a3b1fa91:read-ensureFresh"
    description:
      zh: >
          读取方 ensureFresh
          
      en: >
          reader ensureFresh
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:last-generation-a3b1fa91:read-ensureFresh"
    label: {zh: "读 lastGeneration", en: "read lastGeneration"}
---
