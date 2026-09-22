---
uid: 426ff220
id: truman-town.social.family.lineage
parent: truman-town.social.family
name: {zh: "血脉谱系", en: "Family Lineage"}
description:
  zh: >
      追踪家族代际与成员血缘关系。
      
  en: >
      Traces family generations and blood relations.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T07:57:42.689Z"
fingerprint: b344c01655d5b93ae1e18b1ace5880d8e2fe3cee898b7ad4971b74f154f10273
source:
  - path: "src/social/family/lineage.js"
apis:
  - protocol: rpc
    path: "social.family.lineage.trace"
    description:
      zh: >
          调用 social.family.lineage.trace。
          
      en: >
          Calls social.family.lineage.trace.
          
  - protocol: rpc
    path: "social.family.lineage.generation"
    description:
      zh: >
          调用 social.family.lineage.generation。
          
      en: >
          Calls social.family.lineage.generation.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
    label: {zh: "持久化谱系", en: "Persist lineage"}
---
