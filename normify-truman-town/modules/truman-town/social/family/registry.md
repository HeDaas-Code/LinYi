---
uid: 5ecd05d6
id: truman-town.social.family.registry
parent: truman-town.social.family
name: {zh: "家族登记", en: "Family Registry"}
description:
  zh: >
      创建、查找与解散家族。
      
  en: >
      Creates, looks up and dissolves families.
      
revision: 9f0996005124054052fc61d9ec3f762219e92a2c
updated_at: "2026-09-26T05:45:37.199Z"
fingerprint: a90fcc189cec8083cdf18c7f49727d4e3064b4412cef8948e64892571a960fd9
source:
  - path: "src/social/family/registry.js"
apis:
  - protocol: rpc
    path: "social.family.registry.create"
    description:
      zh: >
          调用 social.family.registry.create。
          
      en: >
          Calls social.family.registry.create.
          
  - protocol: rpc
    path: "social.family.registry.lookup"
    description:
      zh: >
          调用 social.family.registry.lookup。
          
      en: >
          Calls social.family.registry.lookup.
          
  - protocol: rpc
    path: "social.family.registry.dissolve"
    description:
      zh: >
          调用 social.family.registry.dissolve。
          
      en: >
          Calls social.family.registry.dissolve.
          
---
