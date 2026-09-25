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
      
revision: 36ce55d9e3d8994abf455c13925f0c4f4a3f316c
updated_at: "2026-09-25T09:50:41.310Z"
fingerprint: 6e80b99a590086002245e53921ef33519471bb6e5b6f47f0ec397b495ef09ec7
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
