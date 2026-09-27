---
uid: "41e64700"
id: truman-town-flow.state.area.economy.treasury-account-id-076bfbd7
parent: truman-town-flow.state.area.economy
name: {zh: "treasuryAccountId", en: "treasuryAccountId"}
description:
  zh: >
      null 类型，声明于 src/economy/bank/credit.js:20。写入方 2 个、读取方 5 个；已纳入复位。
      
  en: >
      null declared at src/economy/bank/credit.js:20; writers=2, readers=5
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:51.765Z"
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
    path: "treasury-account-id-076bfbd7:write-__restore"
    description:
      zh: >
          写入方 __restore（src/economy/bank/credit.js）
          
      en: >
          writer __restore
          
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
          
  - protocol: rpc
    path: "treasury-account-id-076bfbd7:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "treasury-account-id-076bfbd7:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
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
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:treasury-account-id-076bfbd7:read-__snapshot"
    label: {zh: "读 treasuryAccountId", en: "read treasuryAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:treasury-account-id-076bfbd7:read-__restore"
    label: {zh: "读 treasuryAccountId", en: "read treasuryAccountId"}
---
