---
uid: b007509d
id: truman-town-flow.state.area.agent.last-generation-737e2f5a
parent: truman-town-flow.state.area.agent
name: {zh: "lastGeneration", en: "lastGeneration"}
description:
  zh: >
      number 类型，声明于 src/agent/memory/episodic/store.js:25。写入方 1 个、读取方 1 个；**未纳入复位**（跨 run 可能残留）。
  en: >
      number declared at src/agent/memory/episodic/store.js:25; writers=1, readers=1
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-generation-737e2f5a:write.ensureFresh"
    description:
      zh: >
          写入方 ensureFresh
      en: >
          writer ensureFresh
  - protocol: rpc
    path: "last-generation-737e2f5a:read.ensureFresh"
    description:
      zh: >
          读取方 ensureFresh
      en: >
          reader ensureFresh
---
