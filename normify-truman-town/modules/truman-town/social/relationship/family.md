---
uid: 4ad20e83
id: truman-town.social.relationship.family
parent: truman-town.social.relationship
state: planned
name: {zh: "家庭关系", en: "Family"}
description:
  zh: >
      记录父母子女与亲属关系，支持家族追踪。
  en: >
      Records parent-child and kinship relations for family tracing.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "social.relationship.family.trace"
    description:
      zh: >
          调用 social.relationship.family.trace。
      en: >
          Calls social.relationship.family.trace.
  - protocol: rpc
    path: "social.relationship.family.label"
    description:
      zh: >
          调用 social.relationship.family.label。
      en: >
          Calls social.relationship.family.label.
deps:
  - kind: call
    to: truman-town.social.family.registry
---
