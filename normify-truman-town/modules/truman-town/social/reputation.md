---
uid: "81183679"
id: truman-town.social.reputation
parent: truman-town.social
name: {zh: "声誉系统", en: "Reputation"}
description:
  zh: >
      根据社交与交易行为更新声誉并供查询。
      
  en: >
      Updates and queries reputation from social and economic behavior.
      
revision: 4788222c1cdff2eb10ed7dc2c16d2ef52b8e3596
updated_at: "2026-09-24T05:32:40.350Z"
fingerprint: 9ee9e9e3c302e991f88d53ab2fa29469a9a0921a5b576a7f01dd20dfab5aedf3
source:
  - path: "src/social/reputation.js"
apis:
  - protocol: rpc
    path: "social.reputation.update"
    description:
      zh: >
          调用 social.reputation.update。
          
      en: >
          Calls social.reputation.update.
          
  - protocol: rpc
    path: "social.reputation.query"
    description:
      zh: >
          调用 social.reputation.query。
          
      en: >
          Calls social.reputation.query.
          
deps:
  - kind: dataflow
    to: truman-town.economy.ledger.transaction
---
