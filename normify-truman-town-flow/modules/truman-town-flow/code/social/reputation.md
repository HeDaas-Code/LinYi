---
uid: "91417229"
id: truman-town-flow.code.social.reputation
parent: truman-town-flow.code.social
name: {zh: "social/reputation.js", en: "social/reputation.js"}
description:
  zh: >
      代码模块 src/social/reputation.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/social/reputation.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:36:02.962Z"
fingerprint: 68ec85d0a11dc6390a52c27098643bb89da567051b985a61c307d879dec3af3f
source:
  - path: "src/social/reputation.js"
apis:
  - protocol: rpc
    path: "social.reputation.update"
    description:
      zh: >
          update：模块导出函数。
          
      en: >
          update: exported module function.
          
  - protocol: rpc
    path: "social.reputation.query"
    description:
      zh: >
          query：模块导出函数。
          
      en: >
          query: exported module function.
          
  - protocol: rpc
    path: "social.reputation.list"
    description:
      zh: >
          list：模块导出函数。
          
      en: >
          list: exported module function.
          
  - protocol: rpc
    path: "social.reputation.scoreMap"
    description:
      zh: >
          scoreMap：模块导出函数。
          
      en: >
          scoreMap: exported module function.
          
---
