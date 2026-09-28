---
uid: 0350eb4b
id: truman-town.social.family.trait.enforcer
parent: truman-town.social.family.trait
name: {zh: "特质固化器", en: "Trait Enforcer"}
description:
  zh: >
      把检测通过的特质固化为家族特质，并强制不超过 5 个。
      
  en: >
      Fixes detected traits as family traits and enforces the max of 5.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.837Z"
fingerprint: 7b8daa6903e5066f35a510d8d043c0c91c3f26bb97d966d56eea7790bf118b0d
source:
  - path: "src/social/family/trait/enforcer.js"
apis:
  - protocol: rpc
    path: "social.family.trait.enforcer.set"
    description:
      zh: >
          调用 social.family.trait.enforcer.set。
          
      en: >
          Calls social.family.trait.enforcer.set.
          
  - protocol: rpc
    path: "social.family.trait.enforcer.limit"
    description:
      zh: >
          调用 social.family.trait.enforcer.limit。
          
      en: >
          Calls social.family.trait.enforcer.limit.
          
deps:
  - kind: call
    to: truman-town.social.family.trait.detector
    label: {zh: "检测通过的特质", en: "Detected traits"}
  - kind: call
    to: truman-town.infra.store.graph
    label: {zh: "持久化家族特质", en: "Persist family traits"}
---
