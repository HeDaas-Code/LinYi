---
uid: 69b8382c
id: truman-town.agent.traits.tagset.sampler
parent: truman-town.agent.traits.tagset
name: {zh: "特质采样", en: "Tag Sampler"}
description:
  zh: >
      按权重随机采样特质标签，支持无放回抽取与单标签取样，随机源可 seed 复现。
      
  en: >
      Weighted-samples trait tags without replacement, reproducible via a seeded RNG.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.832Z"
fingerprint: 82f0078f175270b3cf4ab02b9c0c3abc84687eeaa1010d657675f683fffb442b
source:
  - path: "src/agent/traits/tagset/sampler.js"
apis:
  - protocol: rpc
    path: "agent.traits.tagset.sampler.sample"
    description:
      zh: >
          从某智能体标签集按权重抽取 1 个标签；无标签返回 null。
          
      en: >
          Samples one tag from an agent set; null when empty.
          
  - protocol: rpc
    path: "agent.traits.tagset.sampler.weighted"
    description:
      zh: >
          按权重无放回抽取 n 个标签（默认 1）。
          
      en: >
          Samples n distinct tags by weight without replacement (default 1).
          
deps:
  - kind: call
    to: truman-town.infra.rng
---
