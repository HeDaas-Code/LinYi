---
uid: e20f6c63
id: truman-town.economy.industry.labour
parent: truman-town.economy.industry
state: planned
name: {zh: "劳动与雇佣", en: "Labour"}
description:
  zh: >
      发布职位、雇佣与发薪，连接智能体职业与经济。
  en: >
      Posts jobs, hires and pays wages linking careers to economy.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "economy.industry.labour.hire"
    description:
      zh: >
          调用 economy.industry.labour.hire。
      en: >
          Calls economy.industry.labour.hire.
  - protocol: rpc
    path: "economy.industry.labour.pay"
    description:
      zh: >
          调用 economy.industry.labour.pay。
      en: >
          Calls economy.industry.labour.pay.
deps:
  - kind: call
    to: truman-town.economy.ledger.transaction
---
