---
uid: 9f1ae99a
id: truman-town-flow.state.area.agent.by-agent-eca3003b
parent: truman-town-flow.state.area.agent
name: {zh: "byAgent", en: "byAgent"}
description:
  zh: >
      map 类型，声明于 src/agent/memory/semantic.js:21。写入方 2 个、读取方 3 个；已纳入复位。
  en: >
      map declared at src/agent/memory/semantic.js:21; writers=2, readers=3
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "by-agent-eca3003b:write.ensureFresh"
    description:
      zh: >
          写入方 ensureFresh
      en: >
          writer ensureFresh
  - protocol: rpc
    path: "by-agent-eca3003b:write.store"
    description:
      zh: >
          写入方 store
      en: >
          writer store
  - protocol: rpc
    path: "by-agent-eca3003b:read.store"
    description:
      zh: >
          读取方 store
      en: >
          reader store
  - protocol: rpc
    path: "by-agent-eca3003b:read.list"
    description:
      zh: >
          读取方 list
      en: >
          reader list
  - protocol: rpc
    path: "by-agent-eca3003b:read.recall"
    description:
      zh: >
          读取方 recall
      en: >
          reader recall
---
