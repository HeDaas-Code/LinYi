---
uid: cf2aef0f
id: truman-town.survival.health.treatment
parent: truman-town.survival.health
name: {zh: "治疗", en: "Treatment"}
description:
  zh: >
      由医生角色分诊并消耗医疗物资实施治疗。
      
  en: >
      Triages and treats patients using medical supplies.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: 5c46e4e77eea5f1d23db3124fe25a22a31d772551e87e109299b7f67b01d7801
source:
  - path: "src/survival/health/treatment.js"
apis:
  - protocol: rpc
    path: "survival.health.treatment.apply"
    description:
      zh: >
          消耗医疗物资实施一次治疗。
          
      en: >
          Consumes medical supplies and applies one treatment.
          
  - protocol: rpc
    path: "survival.health.treatment.triage"
    description:
      zh: >
          按病情严重度降序分诊患者。
          
      en: >
          Triages patients by descending severity.
          
deps:
  - kind: call
    to: truman-town.survival.resources.medical
  - kind: call
    to: truman-town.agent.role.career
---
