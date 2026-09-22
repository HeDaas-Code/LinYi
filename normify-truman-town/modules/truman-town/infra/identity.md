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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:45:38.726Z"
fingerprint: 1b9ef3cf98e21032abbf873e2c28db43536739d9a6e29ab6ef80841f9854d2e9
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
