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
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.835Z"
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
