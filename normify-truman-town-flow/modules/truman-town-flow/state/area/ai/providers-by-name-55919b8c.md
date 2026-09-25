---
uid: 00ceae21
id: truman-town-flow.state.area.ai.providers-by-name-55919b8c
parent: truman-town-flow.state.area.ai
name: {zh: "providersByName", en: "providersByName"}
description:
  zh: >
      map 类型，声明于 src/ai/llm/gateway.js:73。写入方 3 个、读取方 2 个；已纳入复位。
  en: >
      map declared at src/ai/llm/gateway.js:73; writers=3, readers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "providers-by-name-55919b8c:write.registerProvider"
    description:
      zh: >
          写入方 registerProvider
      en: >
          writer registerProvider
  - protocol: rpc
    path: "providers-by-name-55919b8c:write.registerFromEnv"
    description:
      zh: >
          写入方 registerFromEnv
      en: >
          writer registerFromEnv
  - protocol: rpc
    path: "providers-by-name-55919b8c:write.registerLocalEmbed"
    description:
      zh: >
          写入方 registerLocalEmbed
      en: >
          writer registerLocalEmbed
  - protocol: rpc
    path: "providers-by-name-55919b8c:read.resolveProvider"
    description:
      zh: >
          读取方 resolveProvider
      en: >
          reader resolveProvider
  - protocol: rpc
    path: "providers-by-name-55919b8c:read.provider"
    description:
      zh: >
          读取方 provider
      en: >
          reader provider
---
