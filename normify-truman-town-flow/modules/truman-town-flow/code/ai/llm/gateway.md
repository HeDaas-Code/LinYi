---
uid: 433386f4
id: truman-town-flow.code.ai.llm.gateway
parent: truman-town-flow.code.ai.llm
name: {zh: "ai/llm/gateway.js", en: "ai/llm/gateway.js"}
description:
  zh: >
      代码模块 src/ai/llm/gateway.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/ai/llm/gateway.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:36.859Z"
fingerprint: 160aaa3be4edab87b9a0de7d71e65c522c956237ece1445ab5478fe616f1d030
source:
  - path: "src/ai/llm/gateway.js"
apis:
  - protocol: rpc
    path: "ai.llm.gateway.registerProvider"
    description:
      zh: >
          registerProvider：模块导出函数。
          
      en: >
          registerProvider: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.registerFromEnv"
    description:
      zh: >
          registerFromEnv：模块导出函数。
          
      en: >
          registerFromEnv: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.useA6Api"
    description:
      zh: >
          useA6Api：模块导出函数。
          
      en: >
          useA6Api: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.registerLocalEmbed"
    description:
      zh: >
          registerLocalEmbed：模块导出函数。
          
      en: >
          registerLocalEmbed: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.useLocalEmbed"
    description:
      zh: >
          useLocalEmbed：模块导出函数。
          
      en: >
          useLocalEmbed: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.provider"
    description:
      zh: >
          provider：模块导出函数。
          
      en: >
          provider: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.getProvider"
    description:
      zh: >
          getProvider：模块导出函数。
          
      en: >
          getProvider: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.configure"
    description:
      zh: >
          configure：模块导出函数。
          
      en: >
          configure: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.getConfig"
    description:
      zh: >
          getConfig：模块导出函数。
          
      en: >
          getConfig: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.getStats"
    description:
      zh: >
          getStats：模块导出函数。
          
      en: >
          getStats: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.complete"
    description:
      zh: >
          complete：模块导出函数。
          
      en: >
          complete: exported module function.
          
  - protocol: rpc
    path: "ai.llm.gateway.embed"
    description:
      zh: >
          embed：模块导出函数。
          
      en: >
          embed: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.ai.active-provider-1fdb1e63
    to_api: "rpc:active-provider-1fdb1e63:write-registerProvider"
    label: {zh: "写 activeProvider", en: "write activeProvider"}
  - kind: dataflow
    to: truman-town-flow.state.area.ai.active-provider-1fdb1e63
    to_api: "rpc:active-provider-1fdb1e63:write-useA6Api"
    label: {zh: "写 activeProvider", en: "write activeProvider"}
  - kind: dataflow
    to: truman-town-flow.state.area.ai.active-embed-provider-c9ad6bda
    to_api: "rpc:active-embed-provider-c9ad6bda:write-registerProvider"
    label: {zh: "写 activeEmbedProvide", en: "write activeEmbedProvide"}
  - kind: dataflow
    to: truman-town-flow.state.area.ai.active-embed-provider-c9ad6bda
    to_api: "rpc:active-embed-provider-c9ad6bda:write-useLocalEmbed"
    label: {zh: "写 activeEmbedProvide", en: "write activeEmbedProvide"}
  - kind: dataflow
    to: truman-town-flow.state.area.ai.providers-by-name-55919b8c
    to_api: "rpc:providers-by-name-55919b8c:write-registerProvider"
    label: {zh: "写 providersByName", en: "write providersByName"}
  - kind: dataflow
    to: truman-town-flow.state.area.ai.providers-by-name-55919b8c
    to_api: "rpc:providers-by-name-55919b8c:write-registerFromEnv"
    label: {zh: "写 providersByName", en: "write providersByName"}
  - kind: dataflow
    to: truman-town-flow.state.area.ai.providers-by-name-55919b8c
    to_api: "rpc:providers-by-name-55919b8c:write-registerLocalEmbed"
    label: {zh: "写 providersByName", en: "write providersByName"}
  - kind: dataflow
    to: truman-town-flow.state.area.ai.config-850e5862
    to_api: "rpc:config-850e5862:write-configure"
    label: {zh: "写 config", en: "write config"}
  - kind: dataflow
    to: truman-town-flow.state.area.ai.last-call-at-57ff91b1
    to_api: "rpc:last-call-at-57ff91b1:write-throttle"
    label: {zh: "写 lastCallAt", en: "write lastCallAt"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.step-fn-32e16585
    to_api: "rpc:step-fn-32e16585:write-configure"
    label: {zh: "写 stepFn", en: "write stepFn"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.size-72779cf8
    to_api: "rpc:size-72779cf8:write-configure"
    label: {zh: "写 size", en: "write size"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.initialized-048bc601
    to_api: "rpc:initialized-048bc601:write-configure"
    label: {zh: "写 initialized", en: "write initialized"}
---
