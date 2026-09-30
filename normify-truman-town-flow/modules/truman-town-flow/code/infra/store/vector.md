---
uid: 85478a5d
id: truman-town-flow.code.infra.store.vector
parent: truman-town-flow.code.infra.store
name: {zh: "infra/store/vector.js", en: "infra/store/vector.js"}
description:
  zh: >
      代码模块 src/infra/store/vector.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/infra/store/vector.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:50.676Z"
fingerprint: 056beb6dc30aaf9fce06c4b80bcaf57b696eefd543e5a21e384278a0a5f234ab
source:
  - path: "src/infra/store/vector.js"
apis:
  - protocol: rpc
    path: "infra.store.vector.upsert"
    description:
      zh: >
          upsert：模块导出函数。
          
      en: >
          upsert: exported module function.
          
  - protocol: rpc
    path: "infra.store.vector.search"
    description:
      zh: >
          search：模块导出函数。
          
      en: >
          search: exported module function.
          
  - protocol: rpc
    path: "infra.store.vector.list"
    description:
      zh: >
          list：模块导出函数。
          
      en: >
          list: exported module function.
          
  - protocol: rpc
    path: "infra.store.vector.stats"
    description:
      zh: >
          stats：模块导出函数。
          
      en: >
          stats: exported module function.
          
---
