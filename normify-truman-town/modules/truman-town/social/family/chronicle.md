---
uid: 8dcfec40
id: truman-town.social.family.chronicle
parent: truman-town.social.family
name: {zh: "家族编年史", en: "Family Chronicle"}
description:
  zh: >
      记录家族成员的重要事件并编译成家族史。
      
  en: >
      Records major family events and compiles family history.
      
revision: 1c7c3d69497e4bcdd67b1e32a59bd6bdbfdc92f5
updated_at: "2026-09-24T04:00:14.039Z"
fingerprint: b70796a1ebe6d268d62171ea22b02c408828c266d674485ec468204245d32287
source:
  - path: "src/social/family/chronicle.js"
apis:
  - protocol: rpc
    path: "social.family.chronicle.append"
    description:
      zh: >
          调用 social.family.chronicle.append。
          
      en: >
          Calls social.family.chronicle.append.
          
  - protocol: rpc
    path: "social.family.chronicle.compile"
    description:
      zh: >
          调用 social.family.chronicle.compile。
          
      en: >
          Calls social.family.chronicle.compile.
          
deps:
  - kind: dataflow
    to: truman-town.social.family.lineage
---
