---
uid: c25858a9
id: truman-town.agent.traits.inherit.validator
parent: truman-town.agent.traits.inherit
name: {zh: "遗传校验器", en: "Inheritance Validator"}
description:
  zh: >
      校验子代标签串的合法性（数量/唯一/权重），并审计继承比例。
      
  en: >
      Validates child tag legality (count/uniqueness/weights) and audits inheritance ratio.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.832Z"
fingerprint: 37904151ac870b39d570cc68bcd62360be696ac72a7853ba63bafe55a4026b36
source:
  - path: "src/agent/traits/inherit/validator.js"
apis:
  - protocol: rpc
    path: "agent.traits.inherit.validator.validate"
    description:
      zh: >
          校验标签集数量、key 唯一性与权重合法性，返回 {ok, errors}。
          
      en: >
          Validates count, key uniqueness and weights; returns {ok, errors}.
          
  - protocol: rpc
    path: "agent.traits.inherit.validator.audit"
    description:
      zh: >
          审计子代继承/新变异比例并给出 plausible 判断。
          
      en: >
          Audits inherited/novel ratio and gives a plausibility verdict.
          
deps:
  - kind: call
    to: truman-town.agent.traits.tagset
---
