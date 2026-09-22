---
uid: f2bea971
id: truman-town.observer.chronicle.store
parent: truman-town.observer.chronicle
state: planned
name: {zh: "编年存储", en: "Chronicle Store"}
description:
  zh: >
      查询与范围读取编年志。
  en: >
      Queries and range-reads chronicles.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:27:53Z"
fingerprint: pending
source: []
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
