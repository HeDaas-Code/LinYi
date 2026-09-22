---
uid: "81183679"
id: truman-town.social.reputation
parent: truman-town.social
state: planned
name: {zh: "声誉系统", en: "Reputation"}
description:
  zh: >
      根据社交与交易行为更新声誉并供查询。
  en: >
      Updates and queries reputation from social and economic behavior.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
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
