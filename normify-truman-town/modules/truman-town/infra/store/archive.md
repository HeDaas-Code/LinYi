---
uid: dc44dcf4
id: truman-town.infra.store.archive
parent: truman-town.infra.store
state: planned
name: {zh: "存档存储", en: "Archive Store"}
description:
  zh: >
      保存与加载完整沙盘存档。
  en: >
      Saves and loads full sandbox archives.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "infra.store.archive.save"
    description:
      zh: >
          调用 infra.store.archive.save。
      en: >
          Calls infra.store.archive.save.
  - protocol: rpc
    path: "infra.store.archive.load"
    description:
      zh: >
          调用 infra.store.archive.load。
      en: >
          Calls infra.store.archive.load.
deps:
  - kind: dataflow
    to: truman-town.infra.store.graph
---
