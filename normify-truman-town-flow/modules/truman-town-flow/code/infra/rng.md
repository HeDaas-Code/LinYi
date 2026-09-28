---
uid: 0ffe5a90
id: truman-town-flow.code.infra.rng
parent: truman-town-flow.code.infra
name: {zh: "infra/rng.js", en: "infra/rng.js"}
description:
  zh: >
      代码模块 src/infra/rng.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/infra/rng.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:49.201Z"
fingerprint: 27234027da3536dd2b3fc5cba2134859ef009b0436b2bb352734a6f761168ac0
source:
  - path: "src/infra/rng.js"
apis:
  - protocol: rpc
    path: "infra.rng.seed"
    description:
      zh: >
          seed：模块导出函数。
          
      en: >
          seed: exported module function.
          
  - protocol: rpc
    path: "infra.rng.next"
    description:
      zh: >
          next：模块导出函数。
          
      en: >
          next: exported module function.
          
  - protocol: rpc
    path: "infra.rng.int"
    description:
      zh: >
          int：模块导出函数。
          
      en: >
          int: exported module function.
          
  - protocol: rpc
    path: "infra.rng.float"
    description:
      zh: >
          float：模块导出函数。
          
      en: >
          float: exported module function.
          
  - protocol: rpc
    path: "infra.rng.choice"
    description:
      zh: >
          choice：模块导出函数。
          
      en: >
          choice: exported module function.
          
  - protocol: rpc
    path: "infra.rng.shuffle"
    description:
      zh: >
          shuffle：模块导出函数。
          
      en: >
          shuffle: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.infra.state-b04accf5
    to_api: "rpc:state-b04accf5:write-seed"
    label: {zh: "写 state", en: "write state"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.gen-state-28bc6a9f
    to_api: "rpc:gen-state-28bc6a9f:write-seed"
    label: {zh: "写 genState", en: "write genState"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.gen-3a5a94ca
    to_api: "rpc:gen-3a5a94ca:write-seed"
    label: {zh: "写 gen", en: "write gen"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.seeded-90201ad2
    to_api: "rpc:seeded-90201ad2:write-seed"
    label: {zh: "写 seeded", en: "write seeded"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.accounts-1b938aaa
    to_api: "rpc:accounts-1b938aaa:write-seed"
    label: {zh: "写 accounts", en: "write accounts"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reproduced-pairs-73c79644
    to_api: "rpc:reproduced-pairs-73c79644:write-seed"
    label: {zh: "写 reproducedPairs", en: "write reproducedPairs"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.children-born-70a37a36
    to_api: "rpc:children-born-70a37a36:write-seed"
    label: {zh: "写 childrenBorn", en: "write childrenBorn"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.item-ids-ac5f662d
    to_api: "rpc:item-ids-ac5f662d:write-seed"
    label: {zh: "写 itemIds", en: "write itemIds"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.trade-count-d66a257f
    to_api: "rpc:trade-count-d66a257f:write-seed"
    label: {zh: "写 tradeCount", en: "write tradeCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.craft-count-5379f7c3
    to_api: "rpc:craft-count-5379f7c3:write-seed"
    label: {zh: "写 craftCount", en: "write craftCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.build-count-654c6161
    to_api: "rpc:build-count-654c6161:write-seed"
    label: {zh: "写 buildCount", en: "write buildCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.treat-count-da7ccaa1
    to_api: "rpc:treat-count-da7ccaa1:write-seed"
    label: {zh: "写 treatCount", en: "write treatCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.quarantine-count-01b6f45d
    to_api: "rpc:quarantine-count-01b6f45d:write-seed"
    label: {zh: "写 quarantineCount", en: "write quarantineCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.releases-count-c0fa172f
    to_api: "rpc:releases-count-c0fa172f:write-seed"
    label: {zh: "写 releasesCount", en: "write releasesCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.business-ids-89b39352
    to_api: "rpc:business-ids-89b39352:write-seed"
    label: {zh: "写 businessIds", en: "write businessIds"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.goods-produced-a7bedaa0
    to_api: "rpc:goods-produced-a7bedaa0:write-seed"
    label: {zh: "写 goodsProduced", en: "write goodsProduced"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.wages-paid-d92e43e9
    to_api: "rpc:wages-paid-d92e43e9:write-seed"
    label: {zh: "写 wagesPaid", en: "write wagesPaid"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.bankruptcies-076a85e1
    to_api: "rpc:bankruptcies-076a85e1:write-seed"
    label: {zh: "写 bankruptcies", en: "write bankruptcies"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.credit-issued-4489bb1e
    to_api: "rpc:credit-issued-4489bb1e:write-seed"
    label: {zh: "写 creditIssued", en: "write creditIssued"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.interest-accrued-6d3a86a5
    to_api: "rpc:interest-accrued-6d3a86a5:write-seed"
    label: {zh: "写 interestAccrued", en: "write interestAccrued"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.tax-collected-386c239e
    to_api: "rpc:tax-collected-386c239e:write-seed"
    label: {zh: "写 taxCollected", en: "write taxCollected"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.tax-redistributed-0029f027
    to_api: "rpc:tax-redistributed-0029f027:write-seed"
    label: {zh: "写 taxRedistributed", en: "write taxRedistributed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.supply-account-id-f52bfd85
    to_api: "rpc:supply-account-id-f52bfd85:write-seed"
    label: {zh: "写 supplyAccountId", en: "write supplyAccountId"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.goods-sold-acf04852
    to_api: "rpc:goods-sold-acf04852:write-seed"
    label: {zh: "写 goodsSold", en: "write goodsSold"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.business-revenue-3e3cbeb8
    to_api: "rpc:business-revenue-3e3cbeb8:write-seed"
    label: {zh: "写 businessRevenue", en: "write businessRevenue"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.business-costs-3de6cc7a
    to_api: "rpc:business-costs-3de6cc7a:write-seed"
    label: {zh: "写 businessCosts", en: "write businessCosts"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.resident-energy-used-ba9d6b3f
    to_api: "rpc:resident-energy-used-ba9d6b3f:write-seed"
    label: {zh: "写 residentEnergyUsed", en: "write residentEnergyUsed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.industry-energy-used-158bb575
    to_api: "rpc:industry-energy-used-158bb575:write-seed"
    label: {zh: "写 industryEnergyUsed", en: "write industryEnergyUsed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.loss-ticks-ea2fb2d5
    to_api: "rpc:loss-ticks-ea2fb2d5:write-seed"
    label: {zh: "写 lossTicks", en: "write lossTicks"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.last-community-tick-3666605a
    to_api: "rpc:last-community-tick-3666605a:write-seed"
    label: {zh: "写 lastCommunityTick", en: "write lastCommunityTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.community-snapshot-e96d8a8f
    to_api: "rpc:community-snapshot-e96d8a8f:write-seed"
    label: {zh: "写 communitySnapshot", en: "write communitySnapshot"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.post-count-5b11828b
    to_api: "rpc:post-count-5b11828b:write-seed"
    label: {zh: "写 postCount", en: "write postCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reply-count-0a72580d
    to_api: "rpc:reply-count-0a72580d:write-seed"
    label: {zh: "写 replyCount", en: "write replyCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.react-count-6598cd1c
    to_api: "rpc:react-count-6598cd1c:write-seed"
    label: {zh: "写 reactCount", en: "write reactCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reputation-triage-swaps-f3f74837
    to_api: "rpc:reputation-triage-swaps-f3f74837:write-seed"
    label: {zh: "写 reputationTriageSw", en: "write reputationTriageSw"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reputation-triage-treated-score-493d3084
    to_api: "rpc:reputation-triage-treated-score-493d3084:write-seed"
    label: {zh: "写 reputationTriageTr", en: "write reputationTriageTr"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.last-feed-tick-142dc6ab
    to_api: "rpc:last-feed-tick-142dc6ab:write-seed"
    label: {zh: "写 lastFeedTick", en: "write lastFeedTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.feed-signature-58e88ff0
    to_api: "rpc:feed-signature-58e88ff0:write-seed"
    label: {zh: "写 feedSignature", en: "write feedSignature"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.recent-post-ids-5ac5dfff
    to_api: "rpc:recent-post-ids-5ac5dfff:write-seed"
    label: {zh: "写 recentPostIds", en: "write recentPostIds"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.seeded-39c5dc93
    to_api: "rpc:seeded-39c5dc93:write-seed"
    label: {zh: "写 seeded", en: "write seeded"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.faction-a-2a4cccd8
    to_api: "rpc:faction-a-2a4cccd8:write-seed"
    label: {zh: "写 factionA", en: "write factionA"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.faction-b-2d4cd191
    to_api: "rpc:faction-b-2d4cd191:write-seed"
    label: {zh: "写 factionB", en: "write factionB"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.allied-3f55bd00
    to_api: "rpc:allied-3f55bd00:write-seed"
    label: {zh: "写 allied", en: "write allied"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.law-id-09d4b738
    to_api: "rpc:law-id-09d4b738:write-seed"
    label: {zh: "写 lawId", en: "write lawId"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.law-enforced-7da3ebf7
    to_api: "rpc:law-enforced-7da3ebf7:write-seed"
    label: {zh: "写 lawEnforced", en: "write lawEnforced"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.conflict-id-a5df4d18
    to_api: "rpc:conflict-id-a5df4d18:write-seed"
    label: {zh: "写 conflictId", en: "write conflictId"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.conflict-resolved-5ab5b3ad
    to_api: "rpc:conflict-resolved-5ab5b3ad:write-seed"
    label: {zh: "写 conflictResolved", en: "write conflictResolved"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.norm-violated-e2fb976f
    to_api: "rpc:norm-violated-e2fb976f:write-seed"
    label: {zh: "写 normViolated", en: "write normViolated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.meme-mutated-501a5287
    to_api: "rpc:meme-mutated-501a5287:write-seed"
    label: {zh: "写 memeMutated", en: "write memeMutated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.collapse-handled-cf6b502a
    to_api: "rpc:collapse-handled-cf6b502a:write-seed"
    label: {zh: "写 collapseHandled", en: "write collapseHandled"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.first-collapse-66252b50
    to_api: "rpc:first-collapse-66252b50:write-seed"
    label: {zh: "写 firstCollapse", en: "write firstCollapse"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.scarce-ticks-088efc14
    to_api: "rpc:scarce-ticks-088efc14:write-seed"
    label: {zh: "写 scarceTicks", en: "write scarceTicks"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.laws-enacted-0c7d407e
    to_api: "rpc:laws-enacted-0c7d407e:write-seed"
    label: {zh: "写 lawsEnacted", en: "write lawsEnacted"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.conflicts-resolved-86cba80a
    to_api: "rpc:conflicts-resolved-86cba80a:write-seed"
    label: {zh: "写 conflictsResolved", en: "write conflictsResolved"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.rituals-held-c80f5be2
    to_api: "rpc:rituals-held-c80f5be2:write-seed"
    label: {zh: "写 ritualsHeld", en: "write ritualsHeld"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.norms-violated-de50e530
    to_api: "rpc:norms-violated-de50e530:write-seed"
    label: {zh: "写 normsViolated", en: "write normsViolated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.memes-mutated-ace2d86a
    to_api: "rpc:memes-mutated-ace2d86a:write-seed"
    label: {zh: "写 memesMutated", en: "write memesMutated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.breakdowns-d0633c4b
    to_api: "rpc:breakdowns-d0633c4b:write-seed"
    label: {zh: "写 breakdowns", en: "write breakdowns"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.recoveries-604427c0
    to_api: "rpc:recoveries-604427c0:write-seed"
    label: {zh: "写 recoveries", en: "write recoveries"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.copings-42356782
    to_api: "rpc:copings-42356782:write-seed"
    label: {zh: "写 copings", en: "write copings"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.researches-started-b0336a4f
    to_api: "rpc:researches-started-b0336a4f:write-seed"
    label: {zh: "写 researchesStarted", en: "write researchesStarted"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.researches-completed-cae00af3
    to_api: "rpc:researches-completed-cae00af3:write-seed"
    label: {zh: "写 researchesComplete", en: "write researchesComplete"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.techs-lost-c5ad9d42
    to_api: "rpc:techs-lost-c5ad9d42:write-seed"
    label: {zh: "写 techsLost", en: "write techsLost"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.collapses-64c48635
    to_api: "rpc:collapses-64c48635:write-seed"
    label: {zh: "写 collapses", en: "write collapses"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.restarts-0484992f
    to_api: "rpc:restarts-0484992f:write-seed"
    label: {zh: "写 restarts", en: "write restarts"}
---
