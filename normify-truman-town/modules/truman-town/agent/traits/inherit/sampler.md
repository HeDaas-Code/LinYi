---
uid: 67ee19d8
id: truman-town.agent.traits.inherit.sampler
parent: truman-town.agent.traits.inherit
name: {zh: "遗传抽样器", en: "Inheritance Sampler"}
description:
  zh: >
      从父本母本标签按比例随机组合出子代标签集，子代 key 唯一。
      
  en: >
      Combines paternal/maternal tags into a unique child tag set by ratio.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:24:06.393Z"
fingerprint: a0049d486c0fecaeef7a5679408ce9a6a258b952a5e757de4dd8c103806c04d5
source:
  - path: "src/agent/traits/inherit/sampler.js"
apis:
  - protocol: rpc
    path: "agent.traits.inherit.sampler.combine"
    description:
      zh: >
          按 paternalRatio 组合父本母本标签，生成 size（默认 50）个子代标签。
          
      en: >
          Combines parents into size child tags (default 50) by paternalRatio.
          
  - protocol: rpc
    path: "agent.traits.inherit.sampler.ratio"
    description:
      zh: >
          统计子代标签来自父本/母本/共有/新变异的计数与比例。
          
      en: >
          Counts paternal/maternal/shared/novel inheritance ratios.
          
deps:
  - kind: call
    to: truman-town.infra.rng
  - kind: call
    to: truman-town.agent.traits.tagset
---
