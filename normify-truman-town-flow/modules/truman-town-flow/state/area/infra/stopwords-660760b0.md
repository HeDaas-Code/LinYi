---
uid: b1f964b5
id: truman-town-flow.state.area.infra.stopwords-660760b0
parent: truman-town-flow.state.area.infra
name: {zh: "STOPWORDS", en: "STOPWORDS"}
description:
  zh: >
      set 类型，声明于 src/infra/store/vector.js:20。写入方 0 个、读取方 1 个；**未纳入复位**（跨 run 可能残留）。
      
  en: >
      set declared at src/infra/store/vector.js:20; writers=0, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.220Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "stopwords-660760b0:read-tokenize"
    description:
      zh: >
          读取方 tokenize
          
      en: >
          reader tokenize
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.store.vector
    from_api: "rpc:stopwords-660760b0:read-tokenize"
    label: {zh: "读 STOPWORDS", en: "read STOPWORDS"}
---
