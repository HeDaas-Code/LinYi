---
uid: 4ad20e83
id: truman-town.social.relationship.family
parent: truman-town.social.relationship
name: {zh: "家庭关系", en: "Family"}
description:
  zh: >
      记录父母子女与亲属关系，支持家族追踪。
      
  en: >
      Records parent-child and kinship relations for family tracing.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.838Z"
fingerprint: 77e4484f5dc26439b194078531eb00b52ee03c92ade6d4704fd0fe882e84ae49
source:
  - path: "src/social/relationship/family.js"
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
  - kind: dataflow
    to: truman-town.social.family.lineage
---
