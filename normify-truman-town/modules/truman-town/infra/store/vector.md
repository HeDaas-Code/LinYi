---
uid: 01b79c70
id: truman-town.infra.store.vector
parent: truman-town.infra.store
name: {zh: "向量存储", en: "Vector Store"}
description:
  zh: >
      写入与检索记忆向量。
      
  en: >
      Upserts and searches memory vectors.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.836Z"
fingerprint: 056beb6dc30aaf9fce06c4b80bcaf57b696eefd543e5a21e384278a0a5f234ab
source:
  - path: "src/infra/store/vector.js"
apis:
  - protocol: rpc
    path: "infra.store.vector.upsert"
    description:
      zh: >
          调用 infra.store.vector.upsert。
          
      en: >
          Calls infra.store.vector.upsert.
          
  - protocol: rpc
    path: "infra.store.vector.search"
    description:
      zh: >
          调用 infra.store.vector.search。
          
      en: >
          Calls infra.store.vector.search.
          
---
