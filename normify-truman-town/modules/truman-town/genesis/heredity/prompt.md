---
uid: 2891d412
id: truman-town.genesis.heredity.prompt
parent: truman-town.genesis.heredity
state: planned
name: {zh: "提示词组装", en: "Prompt Assembly"}
description:
  zh: >
      把子代特质、家庭背景与小镇世界观组装成新智能体提示词。
  en: >
      Assembles child traits, family context and town worldview into a new agent prompt.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "genesis.heredity.prompt.assemble"
    description:
      zh: >
          调用 genesis.heredity.prompt.assemble。
      en: >
          Calls genesis.heredity.prompt.assemble.
deps:
  - kind: call
    to: truman-town.ai.prompt.agent
---
