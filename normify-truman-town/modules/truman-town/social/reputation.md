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
      
revision: e317580e2e9326327504170ed572a942b2b0db47
updated_at: "2026-09-24T07:01:20.044Z"
fingerprint: a57930478c3faadf467f03a5c1727b06d40ab0ec475546736be4ee19873f72ea
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
