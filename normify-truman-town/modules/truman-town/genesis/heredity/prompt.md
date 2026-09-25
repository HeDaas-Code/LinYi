---
uid: 2891d412
id: truman-town.genesis.heredity.prompt
parent: truman-town.genesis.heredity
name: {zh: "提示词组装", en: "Prompt Assembly"}
description:
  zh: >
      把子代特质、家庭背景与小镇世界观组装成新智能体提示词。
      
  en: >
      Assembles child traits, family context and town worldview into a new agent prompt.
      
revision: 02dffcd347b42bfde4f8a766a3a77cff7de9c286
updated_at: "2026-09-25T10:17:35.034Z"
fingerprint: 139d70b9c303b9045231b4cc60fdaa51f252d4e52c3a74570aa91bd332f3d690
source:
  - path: "src/genesis/heredity/prompt.js"
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
