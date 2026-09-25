---
uid: "41e64700"
id: truman-town-flow.state.area.economy.treasury-account-id-076bfbd7
parent: truman-town-flow.state.area.economy
name: {zh: "treasuryAccountId", en: "treasuryAccountId"}
description:
  zh: >
      null 类型，声明于 src/economy/bank/credit.js:20。写入方 1 个、读取方 3 个；已纳入复位。
      
  en: >
      null declared at src/economy/bank/credit.js:20; writers=1, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:33.450Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "treasury-account-id-076bfbd7:write-open"
    description:
      zh: >
          写入方 open（src/economy/bank/credit.js）
          
      en: >
          writer open
          
  - protocol: rpc
    path: "treasury-account-id-076bfbd7:read-open"
    description:
      zh: >
          读取方 open
          
      en: >
          reader open
          
  - protocol: rpc
    path: "treasury-account-id-076bfbd7:read-treasury"
    description:
      zh: >
          读取方 treasury
          
      en: >
          reader treasury
          
  - protocol: rpc
    path: "treasury-account-id-076bfbd7:read-apply"
    description:
      zh: >
          读取方 apply
          
      en: >
          reader apply
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.economy.bank.credit
    from_api: "rpc:treasury-account-id-076bfbd7:read-open"
    label: {zh: "读 treasuryAccountId", en: "read treasuryAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.economy.bank.credit
    from_api: "rpc:treasury-account-id-076bfbd7:read-treasury"
    label: {zh: "读 treasuryAccountId", en: "read treasuryAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.economy.bank.credit
    from_api: "rpc:treasury-account-id-076bfbd7:read-apply"
    label: {zh: "读 treasuryAccountId", en: "read treasuryAccountId"}
---
