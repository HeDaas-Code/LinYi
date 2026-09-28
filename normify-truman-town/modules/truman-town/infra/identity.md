---
uid: b89a330c
id: truman-town.infra.identity
parent: truman-town.infra
name: {zh: "ID 生成", en: "Identity"}
description:
  zh: >
      生成全局唯一且有序的实体 ID。
      
  en: >
      Generates globally unique, ordered entity IDs.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.380Z"
fingerprint: a9df5585e710e1c2fd2b96b4f81682b08e41c68060fb77f0d8595da54954daea
source:
  - path: "src/infra/identity.js"
apis:
  - protocol: rpc
    path: "infra.identity.next"
    description:
      zh: >
          生成下一个全局唯一且有序的实体 ID（可带类别前缀）。
          
      en: >
          Generates the next globally unique, ordered entity ID (with optional type prefix).
          
---
