---
uid: f2bea971
id: truman-town.observer.chronicle.store
parent: truman-town.observer.chronicle
name: {zh: "编年存储", en: "Chronicle Store"}
description:
  zh: >
      查询与范围读取编年志。
      
  en: >
      Queries and range-reads chronicles.
      
revision: 796aec9412d132997f5cdc37d01cac934e03d018
updated_at: "2026-09-25T10:03:44.359Z"
fingerprint: 4b4c2d905c73fb29e158d46069575906f843210b5dbcd8d7f1fca4c84f3d937c
source:
  - path: "src/observer/chronicle/store.js"
apis:
  - protocol: rpc
    path: "observer.chronicle.store.query"
    description:
      zh: >
          调用 observer.chronicle.store.query。
          
      en: >
          Calls observer.chronicle.store.query.
          
  - protocol: rpc
    path: "observer.chronicle.store.range"
    description:
      zh: >
          调用 observer.chronicle.store.range。
          
      en: >
          Calls observer.chronicle.store.range.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
