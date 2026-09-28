---
uid: dc44dcf4
id: truman-town.infra.store.archive
parent: truman-town.infra.store
name: {zh: "存档存储", en: "Archive Store"}
description:
  zh: >
      保存与加载完整沙盘存档。
      
  en: >
      Saves and loads full sandbox archives.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.836Z"
fingerprint: 4551403cf17070d8baffb5bd764817d15125549bb3c4e3f4f6076b11c86d6e58
source:
  - path: "src/infra/store/archive.js"
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
