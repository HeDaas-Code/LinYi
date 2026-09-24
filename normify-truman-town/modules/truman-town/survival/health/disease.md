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
      
revision: 5363daa33de6939922915ece1c71fbb993114054
updated_at: "2026-09-24T07:54:56.514Z"
fingerprint: d499f46462fd1a352f5f17950cf6375272f05ce4b35740bc774f8c614563323c
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
