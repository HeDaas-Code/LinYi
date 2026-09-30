---
uid: b2b95509
id: truman-town-flow.machines.list.survival-health-disease-6d289621
parent: truman-town-flow.machines.list
name: {zh: "survival.health.disease（未感染 → 感染中(severity 0..1) → 康复）", en: "survival.health.disease"}
description:
  zh: >
      未感染→感染中：disease.infect({diseaseId, severity})；感染中→感染中：symptom() 推进严重度；感染中→康复：disease.recover()（医疗物资 + 免疫加成）
  en: >
      survival.health.disease state machine with 3 transitions
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "survival-health-disease-6d289621:t0_未感染_to_感染中"
    description:
      zh: >
          disease.infect({diseaseId, severity}) @src/survival/health/disease.js:85
      en: >
          disease.infect({diseaseId, severity})
  - protocol: rpc
    path: "survival-health-disease-6d289621:t1_感染中_to_感染中"
    description:
      zh: >
          symptom() 推进严重度 @src/survival/health/disease.js:114
      en: >
          symptom() 推进严重度
  - protocol: rpc
    path: "survival-health-disease-6d289621:t2_感染中_to_康复"
    description:
      zh: >
          disease.recover()（医疗物资 + 免疫加成） @src/survival/health/disease.js:136
      en: >
          disease.recover()（医疗物资 + 免疫加成）
---
