---
uid: a0a5d05e
id: truman-town-flow.code.infra.store.graph
parent: truman-town-flow.code.infra.store
name: {zh: "infra/store/graph.js", en: "infra/store/graph.js"}
description:
  zh: >
      代码模块 src/infra/store/graph.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/infra/store/graph.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:49.953Z"
fingerprint: 536e8f5dbbfdeb4b85a5f0ad562bd6b2ec9671d54863f3d4bfc3169a07259f6b
source:
  - path: "src/infra/store/graph.js"
apis:
  - protocol: rpc
    path: "infra.store.graph.write"
    description:
      zh: >
          write：模块导出函数。
          
      en: >
          write: exported module function.
          
  - protocol: rpc
    path: "infra.store.graph.read"
    description:
      zh: >
          read：模块导出函数。
          
      en: >
          read: exported module function.
          
  - protocol: rpc
    path: "infra.store.graph.remove"
    description:
      zh: >
          remove：模块导出函数。
          
      en: >
          remove: exported module function.
          
  - protocol: rpc
    path: "infra.store.graph.removeMany"
    description:
      zh: >
          removeMany：模块导出函数。
          
      en: >
          removeMany: exported module function.
          
  - protocol: rpc
    path: "infra.store.graph.count"
    description:
      zh: >
          count：模块导出函数。
          
      en: >
          count: exported module function.
          
  - protocol: rpc
    path: "infra.store.graph.trimOldest"
    description:
      zh: >
          trimOldest：模块导出函数。
          
      en: >
          trimOldest: exported module function.
          
  - protocol: rpc
    path: "infra.store.graph.ids"
    description:
      zh: >
          ids：模块导出函数。
          
      en: >
          ids: exported module function.
          
  - protocol: rpc
    path: "infra.store.graph.patch"
    description:
      zh: >
          patch：模块导出函数。
          
      en: >
          patch: exported module function.
          
  - protocol: rpc
    path: "infra.store.graph.peek"
    description:
      zh: >
          peek：模块导出函数。
          
      en: >
          peek: exported module function.
          
  - protocol: rpc
    path: "infra.store.graph.generation"
    description:
      zh: >
          generation：模块导出函数。
          
      en: >
          generation: exported module function.
          
---
