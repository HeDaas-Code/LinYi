---
uid: 21b4dc5b
id: truman-town-flow.state.area.ai.active-provider-1fdb1e63
parent: truman-town-flow.state.area.ai
name: {zh: "activeProvider", en: "activeProvider"}
description:
  zh: >
      expr 类型，声明于 src/ai/llm/gateway.js:70。写入方 2 个、读取方 3 个；已纳入复位。
  en: >
      expr declared at src/ai/llm/gateway.js:70; writers=2, readers=3
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "active-provider-1fdb1e63:write.registerProvider"
    description:
      zh: >
          写入方 registerProvider
      en: >
          writer registerProvider
  - protocol: rpc
    path: "active-provider-1fdb1e63:write.useA6Api"
    description:
      zh: >
          写入方 useA6Api
      en: >
          writer useA6Api
  - protocol: rpc
    path: "active-provider-1fdb1e63:read.resolveProvider"
    description:
      zh: >
          读取方 resolveProvider
      en: >
          reader resolveProvider
  - protocol: rpc
    path: "active-provider-1fdb1e63:read.provider"
    description:
      zh: >
          读取方 provider
      en: >
          reader provider
  - protocol: rpc
    path: "active-provider-1fdb1e63:read.getProvider"
    description:
      zh: >
          读取方 getProvider
      en: >
          reader getProvider
---
