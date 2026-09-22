---
uid: 8dcfec40
id: truman-town.social.family.chronicle
parent: truman-town.social.family
state: planned
name: {zh: "家族编年史", en: "Family Chronicle"}
description:
  zh: >
      记录家族成员的重要事件并编译成家族史。
  en: >
      Records major family events and compiles family history.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:55:51Z"
fingerprint: pending
source: []
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
