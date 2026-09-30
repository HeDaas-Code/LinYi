---
uid: 601ec068
id: truman-town-flow.state.area.ai.cache-e04b957e
parent: truman-town-flow.state.area.ai
name: {zh: "cache", en: "cache"}
description:
  zh: >
      map 类型，声明于 src/ai/laya.js:30。写入方 1 个、读取方 3 个；已纳入复位。
      
  en: >
      map declared at src/ai/laya.js:30; writers=1, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:51.765Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "cache-e04b957e:write-judge"
    description:
      zh: >
          写入方 judge（src/ai/laya.js）
          
      en: >
          writer judge
          
  - protocol: rpc
    path: "cache-e04b957e:read-getStats"
    description:
      zh: >
          读取方 getStats
          
      en: >
          reader getStats
          
  - protocol: rpc
    path: "cache-e04b957e:read-judge"
    description:
      zh: >
          读取方 judge
          
      en: >
          reader judge
          
  - protocol: rpc
    path: "cache-e04b957e:read-survivalUrgency"
    description:
      zh: >
          读取方 survivalUrgency
          
      en: >
          reader survivalUrgency
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.ai.laya
    from_api: "rpc:cache-e04b957e:read-getStats"
    label: {zh: "读 cache", en: "read cache"}
  - kind: dataflow
    to: truman-town-flow.code.ai.laya
    from_api: "rpc:cache-e04b957e:read-judge"
    label: {zh: "读 cache", en: "read cache"}
  - kind: dataflow
    to: truman-town-flow.code.ai.laya
    from_api: "rpc:cache-e04b957e:read-survivalUrgency"
    label: {zh: "读 cache", en: "read cache"}
---
