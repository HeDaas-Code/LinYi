---
uid: 97eb5ab1
id: truman-town.genesis.heredity.tags
parent: truman-town.genesis.heredity
name: {zh: "标签遗传", en: "Tag Heredity"}
description:
  zh: >
      随机从父母双方 100 个 tag 中抽取 50 个组成子代特质串。
      
  en: >
      Randomly samples 50 tags from 100 parental tags for the child.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.835Z"
fingerprint: c8922df0e187d0c2bd125b85feec177b2bc86232fb902107792c122eae8731bc
source:
  - path: "src/genesis/heredity/tags.js"
apis:
  - protocol: rpc
    path: "genesis.heredity.tags.combine"
    description:
      zh: >
          调用 genesis.heredity.tags.combine。
          
      en: >
          Calls genesis.heredity.tags.combine.
          
  - protocol: rpc
    path: "genesis.heredity.tags.validate"
    description:
      zh: >
          调用 genesis.heredity.tags.validate。
          
      en: >
          Calls genesis.heredity.tags.validate.
          
deps:
  - kind: call
    to: truman-town.agent.traits.inherit
  - kind: call
    to: truman-town.genesis.tag-pool
---
