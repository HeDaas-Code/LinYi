---
uid: dbb8a26e
id: truman-town-flow.state.area.social.valences-ba818f8e
parent: truman-town-flow.state.area.social
name: {zh: "VALENCES", en: "VALENCES"}
description:
  zh: >
      set 类型，声明于 src/social/culture/norms.js:21。写入方 0 个、读取方 1 个；**未纳入复位**（跨 run 可能残留）。
      
  en: >
      set declared at src/social/culture/norms.js:21; writers=0, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "valences-ba818f8e:read-update"
    description:
      zh: >
          读取方 update
          
      en: >
          reader update
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.economy.market.price
    from_api: "rpc:valences-ba818f8e:read-update"
    label: {zh: "读 VALENCES", en: "read VALENCES"}
---
