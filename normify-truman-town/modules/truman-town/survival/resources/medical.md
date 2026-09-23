---
uid: 32fb97c8
id: truman-town.survival.resources.medical
parent: truman-town.survival.resources
name: {zh: "医疗物资", en: "Medical Supplies"}
description:
  zh: >
      追踪药品与医疗物资的生产、消耗与库存。
      
  en: >
      Tracks medicine and medical supply production, consumption and stockpile.
      
revision: da6092c786d6c0615331ed8d297d5c0d6a2fa45a
updated_at: "2026-09-23T12:12:22.376Z"
fingerprint: 44b3db65c5e6f17e9dc93e9e54a9c06ef347681b91ba9f5be73b81d5cf214e3e
source:
  - path: "src/survival/resources/medical.js"
apis:
  - protocol: rpc
    path: "survival.resources.medical.produce"
    description:
      zh: >
          调用 survival.resources.medical.produce。
          
      en: >
          Calls survival.resources.medical.produce.
          
  - protocol: rpc
    path: "survival.resources.medical.consume"
    description:
      zh: >
          调用 survival.resources.medical.consume。
          
      en: >
          Calls survival.resources.medical.consume.
          
  - protocol: rpc
    path: "survival.resources.medical.query"
    description:
      zh: >
          调用 survival.resources.medical.query。
          
      en: >
          Calls survival.resources.medical.query.
          
---
