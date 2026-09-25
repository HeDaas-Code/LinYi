---
uid: 38a9129d
id: truman-town-flow.code.runtime.orchestrator.stage2
parent: truman-town-flow.code.runtime.orchestrator
name: {zh: "runtime/orchestrator/_stage2.js", en: "runtime/orchestrator/_stage2.js"}
description:
  zh: >
      代码模块 src/runtime/orchestrator/_stage2.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/orchestrator/_stage2.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:46.551Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.platform-gen-7b0f3229
    to_api: "rpc:platform-gen-7b0f3229:write-platformSeed"
    label: {zh: "写 platformGen", en: "write platformGen"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.pending-courts-3dc80871
    to_api: "rpc:pending-courts-3dc80871:write-performAgentAction"
    label: {zh: "写 pendingCourts", en: "write pendingCourts"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.paired-index-c43bcba9
    to_api: "rpc:paired-index-c43bcba9:write-performAgentAction"
    label: {zh: "写 pairedIndex", en: "write pairedIndex"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reproduced-pairs-73c79644
    to_api: "rpc:reproduced-pairs-73c79644:write-runProcreation"
    label: {zh: "写 reproducedPairs", en: "write reproducedPairs"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.children-born-70a37a36
    to_api: "rpc:children-born-70a37a36:write-runProcreation"
    label: {zh: "写 childrenBorn", en: "write childrenBorn"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.trade-count-d66a257f
    to_api: "rpc:trade-count-d66a257f:write-runMarket"
    label: {zh: "写 tradeCount", en: "write tradeCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.trade-count-d66a257f
    to_api: "rpc:trade-count-d66a257f:write-runIndustry"
    label: {zh: "写 tradeCount", en: "write tradeCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.craft-count-5379f7c3
    to_api: "rpc:craft-count-5379f7c3:write-runCrafting"
    label: {zh: "写 craftCount", en: "write craftCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.build-count-654c6161
    to_api: "rpc:build-count-654c6161:write-runCrafting"
    label: {zh: "写 buildCount", en: "write buildCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.treat-count-da7ccaa1
    to_api: "rpc:treat-count-da7ccaa1:write-runHealth"
    label: {zh: "写 treatCount", en: "write treatCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.quarantine-count-01b6f45d
    to_api: "rpc:quarantine-count-01b6f45d:write-runHealth"
    label: {zh: "写 quarantineCount", en: "write quarantineCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.releases-count-c0fa172f
    to_api: "rpc:releases-count-c0fa172f:write-runHealth"
    label: {zh: "写 releasesCount", en: "write releasesCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.goods-produced-a7bedaa0
    to_api: "rpc:goods-produced-a7bedaa0:write-runIndustry"
    label: {zh: "写 goodsProduced", en: "write goodsProduced"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.wages-paid-d92e43e9
    to_api: "rpc:wages-paid-d92e43e9:write-runIndustry"
    label: {zh: "写 wagesPaid", en: "write wagesPaid"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.bankruptcies-076a85e1
    to_api: "rpc:bankruptcies-076a85e1:write-runIndustry"
    label: {zh: "写 bankruptcies", en: "write bankruptcies"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.interest-accrued-6d3a86a5
    to_api: "rpc:interest-accrued-6d3a86a5:write-runFiscal"
    label: {zh: "写 interestAccrued", en: "write interestAccrued"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.tax-collected-386c239e
    to_api: "rpc:tax-collected-386c239e:write-runFiscal"
    label: {zh: "写 taxCollected", en: "write taxCollected"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.tax-redistributed-0029f027
    to_api: "rpc:tax-redistributed-0029f027:write-runFiscal"
    label: {zh: "写 taxRedistributed", en: "write taxRedistributed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.goods-sold-acf04852
    to_api: "rpc:goods-sold-acf04852:write-runIndustry"
    label: {zh: "写 goodsSold", en: "write goodsSold"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.business-revenue-3e3cbeb8
    to_api: "rpc:business-revenue-3e3cbeb8:write-runIndustry"
    label: {zh: "写 businessRevenue", en: "write businessRevenue"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.business-costs-3de6cc7a
    to_api: "rpc:business-costs-3de6cc7a:write-runIndustry"
    label: {zh: "写 businessCosts", en: "write businessCosts"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.resident-energy-used-ba9d6b3f
    to_api: "rpc:resident-energy-used-ba9d6b3f:write-runIndustry"
    label: {zh: "写 residentEnergyUsed", en: "write residentEnergyUsed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.industry-energy-used-158bb575
    to_api: "rpc:industry-energy-used-158bb575:write-runIndustry"
    label: {zh: "写 industryEnergyUsed", en: "write industryEnergyUsed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.loss-ticks-ea2fb2d5
    to_api: "rpc:loss-ticks-ea2fb2d5:write-runIndustry"
    label: {zh: "写 lossTicks", en: "write lossTicks"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.last-community-tick-3666605a
    to_api: "rpc:last-community-tick-3666605a:write-runCommunity"
    label: {zh: "写 lastCommunityTick", en: "write lastCommunityTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.community-snapshot-e96d8a8f
    to_api: "rpc:community-snapshot-e96d8a8f:write-runCommunity"
    label: {zh: "写 communitySnapshot", en: "write communitySnapshot"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.post-count-5b11828b
    to_api: "rpc:post-count-5b11828b:write-runPlatform"
    label: {zh: "写 postCount", en: "write postCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reply-count-0a72580d
    to_api: "rpc:reply-count-0a72580d:write-runPlatform"
    label: {zh: "写 replyCount", en: "write replyCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.react-count-6598cd1c
    to_api: "rpc:react-count-6598cd1c:write-runPlatform"
    label: {zh: "写 reactCount", en: "write reactCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reputation-triage-swaps-f3f74837
    to_api: "rpc:reputation-triage-swaps-f3f74837:write-runHealth"
    label: {zh: "写 reputationTriageSw", en: "write reputationTriageSw"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reputation-triage-treated-score-493d3084
    to_api: "rpc:reputation-triage-treated-score-493d3084:write-runHealth"
    label: {zh: "写 reputationTriageTr", en: "write reputationTriageTr"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.last-feed-tick-142dc6ab
    to_api: "rpc:last-feed-tick-142dc6ab:write-runPlatform"
    label: {zh: "写 lastFeedTick", en: "write lastFeedTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.feed-signature-58e88ff0
    to_api: "rpc:feed-signature-58e88ff0:write-runPlatform"
    label: {zh: "写 feedSignature", en: "write feedSignature"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.recent-post-ids-5ac5dfff
    to_api: "rpc:recent-post-ids-5ac5dfff:write-runPlatform"
    label: {zh: "写 recentPostIds", en: "write recentPostIds"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.candidate-state-cache-93c7ac3d
    to_api: "rpc:candidate-state-cache-93c7ac3d:write-candidateStateFor"
    label: {zh: "写 _candidateStateCac", en: "write _candidateStateCac"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.candidate-state-cache-tick-02b4577c
    to_api: "rpc:candidate-state-cache-tick-02b4577c:write-candidateStateFor"
    label: {zh: "写 _candidateStateCac", en: "write _candidateStateCac"}
---
