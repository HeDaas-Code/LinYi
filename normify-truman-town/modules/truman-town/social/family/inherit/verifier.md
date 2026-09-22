---
uid: a1663c78
id: truman-town.social.family.inherit.verifier
parent: truman-town.social.family.inherit
name: {zh: "遗传审计器", en: "Inheritance Verifier"}
description:
  zh: >
      查询与审计家族特质继承记录。
      
  en: >
      Queries and audits family trait inheritance records.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T07:57:42.689Z"
fingerprint: c72b12e7df3cf9d4a647ca958a3b0896c47801e89b758264728687f414bc6a4f
source:
  - path: "src/social/family/inherit/verifier.js"
apis:
  - protocol: rpc
    path: "social.family.inherit.verifier.query"
    description:
      zh: >
          调用 social.family.inherit.verifier.query。
          
      en: >
          Calls social.family.inherit.verifier.query.
          
  - protocol: rpc
    path: "social.family.inherit.verifier.audit"
    description:
      zh: >
          调用 social.family.inherit.verifier.audit。
          
      en: >
          Calls social.family.inherit.verifier.audit.
          
deps:
  - kind: call
    to: truman-town.agent.traits.tagset.store
    label: {zh: "读取标签集审计", en: "Read tagsets for audit"}
---
