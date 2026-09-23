---
uid: e20f6c63
id: truman-town.economy.industry.labour
parent: truman-town.economy.industry
name: {zh: "劳动与雇佣", en: "Labour"}
description:
  zh: >
      发布职位、雇佣与发薪，连接智能体职业与经济。
      
  en: >
      Posts jobs, hires and pays wages linking careers to economy.
      
revision: f4968a009dccf5f3735a3f0d7a362ed5f05ff7bf
updated_at: "2026-09-23T12:16:51.980Z"
fingerprint: 8c85094e7b84915a4e0aba11b88019c8fa24dc286bcfee385ff830748a3e8af1
source:
  - path: "src/economy/industry/labour.js"
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
