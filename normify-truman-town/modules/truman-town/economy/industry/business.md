---
uid: 8f1d8015
id: truman-town.economy.industry.business
parent: truman-town.economy.industry
name: {zh: "企业", en: "Business"}
description:
  zh: >
      创办、运营与关闭企业，构成小镇产业组成。企业由居民自主决策创办（found 行动），不再由播种阶段固定引导；创办资本自创始人账户转入企业账户，保证复式记账货币守恒。
      
  en: >
      Founds, operates and closes businesses. Firms are created by agent decision rather than fixed bootstrapping; founding capital moves from the founder account into the business account so money is conserved.
      
revision: 45f6c8b7b8ba210fcd94506b2097c8e601dd1382
updated_at: "2026-09-26T03:35:08.159Z"
fingerprint: 68ede4b03721b220f3eaf5b462243f40dd3673930067225cd62977ea9b4a8592
source:
  - path: "src/economy/industry/business.js"
apis:
  - protocol: rpc
    path: "economy.industry.business.found"
    description:
      zh: >
          创办企业。capitalFrom 非空时从该账户转入资本（货币守恒），为空则按外部注资建账。
          
      en: >
          Founds a business. When capitalFrom is set, capital is transferred from that account; otherwise the account is opened with external funding.
          
  - protocol: rpc
    path: "economy.industry.business.operate"
    description:
      zh: >
          推进一期生产与结算。
          
      en: >
          Runs one production and settlement round.
          
  - protocol: rpc
    path: "economy.industry.business.close"
    description:
      zh: >
          关闭企业并清算账户。
          
      en: >
          Closes a business and settles its account.
          
deps:
  - kind: call
    to: truman-town.town.map.zoning
  - kind: call
    to: truman-town.town.building.space
---
