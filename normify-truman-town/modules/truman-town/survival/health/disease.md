---
uid: d7ae80f6
id: truman-town.survival.health.disease
parent: truman-town.survival.health
name: {zh: "疾病", en: "Disease"}
description:
  zh: >
      感染、症状发展与康复，受特质免疫与医疗物资影响。
      
  en: >
      Infection, symptom progression and recovery shaped by trait immunity and medical supplies.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.384Z"
fingerprint: 192c3b664e8e58c1111ae224ed39952dc10fe67c4cfe367741cd9cf045acf7df
source:
  - path: "src/survival/health/disease.js"
apis:
  - protocol: rpc
    path: "survival.health.disease.infect"
    description:
      zh: >
          施加感染，受特质免疫抵抗或削弱。
          
      en: >
          Applies an infection, resisted or weakened by trait immunity.
          
  - protocol: rpc
    path: "survival.health.disease.symptom"
    description:
      zh: >
          推进症状：严重度上升、健康下降。
          
      en: >
          Progresses symptoms: severity rises and health declines.
          
  - protocol: rpc
    path: "survival.health.disease.recover"
    description:
      zh: >
          康复：严重度下降、健康回升，受免疫与医疗物资加成。
          
      en: >
          Recovers: severity falls and health rises, boosted by immunity and medical supplies.
          
deps:
  - kind: call
    to: truman-town.agent.traits.tagset
  - kind: call
    to: truman-town.survival.resources.medical
---
