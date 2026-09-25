---
uid: 882f39ed
id: truman-town-flow.state.area.ai.active-embed-provider-c9ad6bda
parent: truman-town-flow.state.area.ai
name: {zh: "activeEmbedProvider", en: "activeEmbedProvider"}
description:
  zh: >
      expr 类型，声明于 src/ai/llm/gateway.js:71。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      expr declared at src/ai/llm/gateway.js:71; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:33.450Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "active-embed-provider-c9ad6bda:write-registerProvider"
    description:
      zh: >
          写入方 registerProvider（src/ai/llm/gateway.js）
          
      en: >
          writer registerProvider
          
  - protocol: rpc
    path: "active-embed-provider-c9ad6bda:write-useLocalEmbed"
    description:
      zh: >
          写入方 useLocalEmbed（src/ai/llm/gateway.js）
          
      en: >
          writer useLocalEmbed
          
  - protocol: rpc
    path: "active-embed-provider-c9ad6bda:read-embed"
    description:
      zh: >
          读取方 embed
          
      en: >
          reader embed
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.ai.llm.gateway
    from_api: "rpc:active-embed-provider-c9ad6bda:read-embed"
    label: {zh: "读 activeEmbedProvide", en: "read activeEmbedProvide"}
---
