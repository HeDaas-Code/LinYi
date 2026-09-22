---
uid: a32b2d23
id: truman-town.social.relationship.romance
parent: truman-town.social.relationship
name: {zh: "恋爱关系", en: "Romance"}
description:
  zh: >
      处理表白、接受、拒绝与分手，支持配对与亲密升级。
      
  en: >
      Handles proposals, acceptance, rejection and breakups.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T07:57:42.688Z"
fingerprint: ece370677269a357f36249326f6a41d04a768d29d2b07b6412ea5855f965aa73
source:
  - path: "src/social/relationship/romance.js"
apis:
  - protocol: rpc
    path: "social.relationship.romance.propose"
    description:
      zh: >
          调用 social.relationship.romance.propose。
          
      en: >
          Calls social.relationship.romance.propose.
          
  - protocol: rpc
    path: "social.relationship.romance.accept"
    description:
      zh: >
          调用 social.relationship.romance.accept。
          
      en: >
          Calls social.relationship.romance.accept.
          
  - protocol: rpc
    path: "social.relationship.romance.breakup"
    description:
      zh: >
          调用 social.relationship.romance.breakup。
          
      en: >
          Calls social.relationship.romance.breakup.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
    label: {zh: "持久化恋爱纽带", en: "Persist romance bond"}
---
