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
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.383Z"
fingerprint: 68ec85d0a11dc6390a52c27098643bb89da567051b985a61c307d879dec3af3f
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
