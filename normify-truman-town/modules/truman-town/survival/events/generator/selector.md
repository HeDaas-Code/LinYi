---
uid: 7b6bdcaa
id: truman-town.survival.events.generator.selector
parent: truman-town.survival.events.generator
name: {zh: "事件选择器", en: "Event Selector"}
description:
  zh: >
      按权重选择具体突发事件。
      
  en: >
      Selects a concrete event by weight.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: 47141aeea9251abc9943f6c8fa6de11592cab6b0f0bdccb381ad828a91b3e17a
source:
  - path: "src/survival/events/generator/selector.js"
apis:
  - protocol: rpc
    path: "survival.events.generator.selector.select"
    description:
      zh: >
          按权重抽取一个具体突发事件。
          
      en: >
          Selects a concrete event by weight.
          
  - protocol: rpc
    path: "survival.events.generator.selector.weigh"
    description:
      zh: >
          归一化事件并按类型倍率计算权重。
          
      en: >
          Normalizes events and computes weights with per-type multipliers.
          
deps:
  - kind: call
    to: truman-town.survival.events.generator.roller
---
