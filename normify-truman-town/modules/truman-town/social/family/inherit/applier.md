---
uid: 428337f9
id: truman-town.social.family.inherit.applier
parent: truman-town.social.family.inherit
name: {zh: "特质应用器", en: "Inheritance Applier"}
description:
  zh: >
      把家族特质合并进族内新生儿的 50 标签串。
      
  en: >
      Merges family traits into the 50-tag set of newborn family members.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.837Z"
fingerprint: b2181bcc86088ebfe70ed2c4e17872252f7c3f18485a57a5c135f8b8fa2c2ade
source:
  - path: "src/social/family/inherit/applier.js"
apis:
  - protocol: rpc
    path: "social.family.inherit.applier.apply"
    description:
      zh: >
          调用 social.family.inherit.applier.apply。
          
      en: >
          Calls social.family.inherit.applier.apply.
          
  - protocol: rpc
    path: "social.family.inherit.applier.merge"
    description:
      zh: >
          调用 social.family.inherit.applier.merge。
          
      en: >
          Calls social.family.inherit.applier.merge.
          
deps:
  - kind: call
    to: truman-town.agent.traits.inherit.sampler
    label: {zh: "组合父母标签", en: "Combine parent tags"}
  - kind: call
    to: truman-town.agent.traits.inherit.validator
    label: {zh: "校验子代标签", en: "Validate offspring tags"}
  - kind: call
    to: truman-town.agent.traits.tagset.store
    label: {zh: "标签数量设定", en: "Tag count constant"}
  - kind: call
    to: truman-town.social.family.trait.enforcer
    label: {zh: "家族特质来源", en: "Family traits source"}
---
