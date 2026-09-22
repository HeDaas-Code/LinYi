---
uid: 97eb5ab1
id: truman-town.genesis.heredity.tags
parent: truman-town.genesis.heredity
state: planned
name: {zh: "标签遗传", en: "Tag Heredity"}
description:
  zh: >
      随机从父母双方 100 个 tag 中抽取 50 个组成子代特质串。
  en: >
      Randomly samples 50 tags from 100 parental tags for the child.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
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
---
