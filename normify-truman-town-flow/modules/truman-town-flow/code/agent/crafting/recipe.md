---
uid: c2833e78
id: truman-town-flow.code.agent.crafting.recipe
parent: truman-town-flow.code.agent.crafting
name: {zh: "agent/crafting/recipe.js", en: "agent/crafting/recipe.js"}
description:
  zh: >
      代码模块 src/agent/crafting/recipe.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/crafting/recipe.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:42:20.961Z"
fingerprint: 22eabca8a4bca14a79201b3d1081951722a2cfdeb976a6ef94744280a678c849
source:
  - path: "src/agent/crafting/recipe.js"
apis:
  - protocol: rpc
    path: "agent.crafting.recipe.recipe.define"
    description:
      zh: >
          定义工艺配方。
          
      en: >
          Define a crafting recipe.
          
  - protocol: rpc
    path: "agent.crafting.recipe.recipe.query"
    description:
      zh: >
          查询已定义配方。
          
      en: >
          Query a defined recipe.
          
  - protocol: rpc
    path: "agent.crafting.recipe.recipe.learn"
    description:
      zh: >
          记录居民学会配方。
          
      en: >
          Record a learned recipe.
          
  - protocol: rpc
    path: "agent.crafting.recipe.recipe.isLearned"
    description:
      zh: >
          检查居民是否学会配方。
          
      en: >
          Check whether an agent learned a recipe.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.recipes-6c89fd3f
    to_api: "rpc:recipes-6c89fd3f:write-define"
    label: {zh: "写 recipes", en: "write recipes"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.recipes-6c89fd3f
    to_api: "rpc:recipes-6c89fd3f:write-__restore"
    label: {zh: "写 recipes", en: "write recipes"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.learned-79f9f1af
    to_api: "rpc:learned-79f9f1af:write-learn"
    label: {zh: "写 learned", en: "write learned"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.learned-79f9f1af
    to_api: "rpc:learned-79f9f1af:write-__restore"
    label: {zh: "写 learned", en: "write learned"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.seq-903a9217
    to_api: "rpc:seq-903a9217:write-__restore"
    label: {zh: "写 seq", en: "write seq"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.table-e9467aa6
    to_api: "rpc:table-e9467aa6:write-__restore"
    label: {zh: "写 table", en: "write table"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.lru-c1c7a3b7
    to_api: "rpc:lru-c1c7a3b7:write-__restore"
    label: {zh: "写 lru", en: "write lru"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.lru-seq-4ff8632e
    to_api: "rpc:lru-seq-4ff8632e:write-__restore"
    label: {zh: "写 lruSeq", en: "write lruSeq"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.observations-6b560735
    to_api: "rpc:observations-6b560735:write-__restore"
    label: {zh: "写 observations", en: "write observations"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.backpacks-19f4cfd5
    to_api: "rpc:backpacks-19f4cfd5:write-__restore"
    label: {zh: "写 backpacks", en: "write backpacks"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.items-fc8d8f4b
    to_api: "rpc:items-fc8d8f4b:write-define"
    label: {zh: "写 items", en: "write items"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.items-fc8d8f4b
    to_api: "rpc:items-fc8d8f4b:write-__restore"
    label: {zh: "写 items", en: "write items"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.by-agent-86ec5f42
    to_api: "rpc:by-agent-86ec5f42:write-__restore"
    label: {zh: "写 byAgent", en: "write byAgent"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.last-generation-737e2f5a
    to_api: "rpc:last-generation-737e2f5a:write-__restore"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.by-agent-eca3003b
    to_api: "rpc:by-agent-eca3003b:write-__restore"
    label: {zh: "写 byAgent", en: "write byAgent"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.last-generation-4f7f9071
    to_api: "rpc:last-generation-4f7f9071:write-__restore"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.broken-agents-749c1570
    to_api: "rpc:broken-agents-749c1570:write-__restore"
    label: {zh: "写 brokenAgents", en: "write brokenAgents"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.active-coping-22d99f84
    to_api: "rpc:active-coping-22d99f84:write-__restore"
    label: {zh: "写 activeCoping", en: "write activeCoping"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.events-by-agent-63e338fd
    to_api: "rpc:events-by-agent-63e338fd:write-__restore"
    label: {zh: "写 eventsByAgent", en: "write eventsByAgent"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.last-generation-a00b5dfa
    to_api: "rpc:last-generation-a00b5dfa:write-__restore"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
  - kind: dataflow
    to: truman-town-flow.state.area.civilization.active-b942d96b
    to_api: "rpc:active-b942d96b:write-__restore"
    label: {zh: "写 active", en: "write active"}
  - kind: dataflow
    to: truman-town-flow.state.area.economy.treasury-account-id-076bfbd7
    to_api: "rpc:treasury-account-id-076bfbd7:write-__restore"
    label: {zh: "写 treasuryAccountId", en: "write treasuryAccountId"}
  - kind: dataflow
    to: truman-town-flow.state.area.economy.seq-408361b9
    to_api: "rpc:seq-408361b9:write-__restore"
    label: {zh: "写 seq", en: "write seq"}
  - kind: dataflow
    to: truman-town-flow.state.area.economy.prices-8b89e4ac
    to_api: "rpc:prices-8b89e4ac:write-__restore"
    label: {zh: "写 prices", en: "write prices"}
  - kind: dataflow
    to: truman-town-flow.state.area.economy.pool-account-id-dfd57156
    to_api: "rpc:pool-account-id-dfd57156:write-__restore"
    label: {zh: "写 poolAccountId", en: "write poolAccountId"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.current-difficulty-id-59939754
    to_api: "rpc:current-difficulty-id-59939754:write-__restore"
    label: {zh: "写 currentDifficultyI", en: "write currentDifficultyI"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.queue-d30bf235
    to_api: "rpc:queue-d30bf235:write-__restore"
    label: {zh: "写 queue", en: "write queue"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.dead-letters-5964bca1
    to_api: "rpc:dead-letters-5964bca1:write-__restore"
    label: {zh: "写 deadLetters", en: "write deadLetters"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.stats-a44339a1
    to_api: "rpc:stats-a44339a1:write-__restore"
    label: {zh: "写 stats", en: "write stats"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.counter-d8b78ddd
    to_api: "rpc:counter-d8b78ddd:write-__restore"
    label: {zh: "写 counter", en: "write counter"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.state-b04accf5
    to_api: "rpc:state-b04accf5:write-__restore"
    label: {zh: "写 state", en: "write state"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.gen-state-28bc6a9f
    to_api: "rpc:gen-state-28bc6a9f:write-__restore"
    label: {zh: "写 genState", en: "write genState"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.gen-3a5a94ca
    to_api: "rpc:gen-3a5a94ca:write-__restore"
    label: {zh: "写 gen", en: "write gen"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.nodes-231cb4f7
    to_api: "rpc:nodes-231cb4f7:write-__restore"
    label: {zh: "写 nodes", en: "write nodes"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.by-type-49f64b03
    to_api: "rpc:by-type-49f64b03:write-__restore"
    label: {zh: "写 byType", en: "write byType"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.generation-6bb3f83c
    to_api: "rpc:generation-6bb3f83c:write-__restore"
    label: {zh: "写 generation", en: "write generation"}
  - kind: dataflow
    to: truman-town-flow.state.area.observer.seq-62c22802
    to_api: "rpc:seq-62c22802:write-__restore"
    label: {zh: "写 seq", en: "write seq"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.current-tick-af3bf7fd
    to_api: "rpc:current-tick-af3bf7fd:write-__restore"
    label: {zh: "写 currentTick", en: "write currentTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.started-at-46c5f2b9
    to_api: "rpc:started-at-46c5f2b9:write-__restore"
    label: {zh: "写 startedAt", en: "write startedAt"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.task-seq-d700f01d
    to_api: "rpc:task-seq-d700f01d:write-__restore"
    label: {zh: "写 taskSeq", en: "write taskSeq"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.tasks-79b3964f
    to_api: "rpc:tasks-79b3964f:write-__restore"
    label: {zh: "写 tasks", en: "write tasks"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.seeded-90201ad2
    to_api: "rpc:seeded-90201ad2:write-__restore"
    label: {zh: "写 seeded", en: "write seeded"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.accounts-1b938aaa
    to_api: "rpc:accounts-1b938aaa:write-__restore"
    label: {zh: "写 accounts", en: "write accounts"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.settled-agent-ids-6dcf86b2
    to_api: "rpc:settled-agent-ids-6dcf86b2:write-__restore"
    label: {zh: "写 settledAgentIds", en: "write settledAgentIds"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.pending-courts-3dc80871
    to_api: "rpc:pending-courts-3dc80871:write-__restore"
    label: {zh: "写 pendingCourts", en: "write pendingCourts"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.paired-index-c43bcba9
    to_api: "rpc:paired-index-c43bcba9:write-__restore"
    label: {zh: "写 pairedIndex", en: "write pairedIndex"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reproduced-pairs-73c79644
    to_api: "rpc:reproduced-pairs-73c79644:write-__restore"
    label: {zh: "写 reproducedPairs", en: "write reproducedPairs"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.children-born-70a37a36
    to_api: "rpc:children-born-70a37a36:write-__restore"
    label: {zh: "写 childrenBorn", en: "write childrenBorn"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.item-ids-ac5f662d
    to_api: "rpc:item-ids-ac5f662d:write-__restore"
    label: {zh: "写 itemIds", en: "write itemIds"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.trade-count-d66a257f
    to_api: "rpc:trade-count-d66a257f:write-__restore"
    label: {zh: "写 tradeCount", en: "write tradeCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.craft-count-5379f7c3
    to_api: "rpc:craft-count-5379f7c3:write-__restore"
    label: {zh: "写 craftCount", en: "write craftCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.build-count-654c6161
    to_api: "rpc:build-count-654c6161:write-__restore"
    label: {zh: "写 buildCount", en: "write buildCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.treat-count-da7ccaa1
    to_api: "rpc:treat-count-da7ccaa1:write-__restore"
    label: {zh: "写 treatCount", en: "write treatCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.quarantine-count-01b6f45d
    to_api: "rpc:quarantine-count-01b6f45d:write-__restore"
    label: {zh: "写 quarantineCount", en: "write quarantineCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.releases-count-c0fa172f
    to_api: "rpc:releases-count-c0fa172f:write-__restore"
    label: {zh: "写 releasesCount", en: "write releasesCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.business-ids-89b39352
    to_api: "rpc:business-ids-89b39352:write-__restore"
    label: {zh: "写 businessIds", en: "write businessIds"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.goods-produced-a7bedaa0
    to_api: "rpc:goods-produced-a7bedaa0:write-__restore"
    label: {zh: "写 goodsProduced", en: "write goodsProduced"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.wages-paid-d92e43e9
    to_api: "rpc:wages-paid-d92e43e9:write-__restore"
    label: {zh: "写 wagesPaid", en: "write wagesPaid"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.bankruptcies-076a85e1
    to_api: "rpc:bankruptcies-076a85e1:write-__restore"
    label: {zh: "写 bankruptcies", en: "write bankruptcies"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.credit-issued-4489bb1e
    to_api: "rpc:credit-issued-4489bb1e:write-__restore"
    label: {zh: "写 creditIssued", en: "write creditIssued"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.interest-accrued-6d3a86a5
    to_api: "rpc:interest-accrued-6d3a86a5:write-__restore"
    label: {zh: "写 interestAccrued", en: "write interestAccrued"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.tax-collected-386c239e
    to_api: "rpc:tax-collected-386c239e:write-__restore"
    label: {zh: "写 taxCollected", en: "write taxCollected"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.tax-redistributed-0029f027
    to_api: "rpc:tax-redistributed-0029f027:write-__restore"
    label: {zh: "写 taxRedistributed", en: "write taxRedistributed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.supply-account-id-f52bfd85
    to_api: "rpc:supply-account-id-f52bfd85:write-__restore"
    label: {zh: "写 supplyAccountId", en: "write supplyAccountId"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.goods-sold-acf04852
    to_api: "rpc:goods-sold-acf04852:write-__restore"
    label: {zh: "写 goodsSold", en: "write goodsSold"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.business-revenue-3e3cbeb8
    to_api: "rpc:business-revenue-3e3cbeb8:write-__restore"
    label: {zh: "写 businessRevenue", en: "write businessRevenue"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.business-costs-3de6cc7a
    to_api: "rpc:business-costs-3de6cc7a:write-__restore"
    label: {zh: "写 businessCosts", en: "write businessCosts"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.resident-energy-used-ba9d6b3f
    to_api: "rpc:resident-energy-used-ba9d6b3f:write-__restore"
    label: {zh: "写 residentEnergyUsed", en: "write residentEnergyUsed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.industry-energy-used-158bb575
    to_api: "rpc:industry-energy-used-158bb575:write-__restore"
    label: {zh: "写 industryEnergyUsed", en: "write industryEnergyUsed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.loss-ticks-ea2fb2d5
    to_api: "rpc:loss-ticks-ea2fb2d5:write-__restore"
    label: {zh: "写 lossTicks", en: "write lossTicks"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.last-community-tick-3666605a
    to_api: "rpc:last-community-tick-3666605a:write-__restore"
    label: {zh: "写 lastCommunityTick", en: "write lastCommunityTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.community-snapshot-e96d8a8f
    to_api: "rpc:community-snapshot-e96d8a8f:write-__restore"
    label: {zh: "写 communitySnapshot", en: "write communitySnapshot"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.post-count-5b11828b
    to_api: "rpc:post-count-5b11828b:write-__restore"
    label: {zh: "写 postCount", en: "write postCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reply-count-0a72580d
    to_api: "rpc:reply-count-0a72580d:write-__restore"
    label: {zh: "写 replyCount", en: "write replyCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.react-count-6598cd1c
    to_api: "rpc:react-count-6598cd1c:write-__restore"
    label: {zh: "写 reactCount", en: "write reactCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reputation-triage-swaps-f3f74837
    to_api: "rpc:reputation-triage-swaps-f3f74837:write-__restore"
    label: {zh: "写 reputationTriageSw", en: "write reputationTriageSw"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reputation-triage-treated-score-493d3084
    to_api: "rpc:reputation-triage-treated-score-493d3084:write-__restore"
    label: {zh: "写 reputationTriageTr", en: "write reputationTriageTr"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.last-feed-tick-142dc6ab
    to_api: "rpc:last-feed-tick-142dc6ab:write-__restore"
    label: {zh: "写 lastFeedTick", en: "write lastFeedTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.feed-signature-58e88ff0
    to_api: "rpc:feed-signature-58e88ff0:write-__restore"
    label: {zh: "写 feedSignature", en: "write feedSignature"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.recent-post-ids-5ac5dfff
    to_api: "rpc:recent-post-ids-5ac5dfff:write-__restore"
    label: {zh: "写 recentPostIds", en: "write recentPostIds"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.candidate-state-cache-93c7ac3d
    to_api: "rpc:candidate-state-cache-93c7ac3d:write-__restore"
    label: {zh: "写 _candidateStateCac", en: "write _candidateStateCac"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.candidate-state-cache-tick-02b4577c
    to_api: "rpc:candidate-state-cache-tick-02b4577c:write-__restore"
    label: {zh: "写 _candidateStateCac", en: "write _candidateStateCac"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.found-capital-config-3a5e75f0
    to_api: "rpc:found-capital-config-3a5e75f0:write-__restore"
    label: {zh: "写 foundCapitalConfig", en: "write foundCapitalConfig"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.reserve-scale-pop-ea238683
    to_api: "rpc:reserve-scale-pop-ea238683:write-__restore"
    label: {zh: "写 reserveScalePop", en: "write reserveScalePop"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.seeded-39c5dc93
    to_api: "rpc:seeded-39c5dc93:write-__restore"
    label: {zh: "写 seeded", en: "write seeded"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.faction-a-2a4cccd8
    to_api: "rpc:faction-a-2a4cccd8:write-__restore"
    label: {zh: "写 factionA", en: "write factionA"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.faction-b-2d4cd191
    to_api: "rpc:faction-b-2d4cd191:write-__restore"
    label: {zh: "写 factionB", en: "write factionB"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.allied-3f55bd00
    to_api: "rpc:allied-3f55bd00:write-__restore"
    label: {zh: "写 allied", en: "write allied"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.law-id-09d4b738
    to_api: "rpc:law-id-09d4b738:write-__restore"
    label: {zh: "写 lawId", en: "write lawId"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.law-enforced-7da3ebf7
    to_api: "rpc:law-enforced-7da3ebf7:write-__restore"
    label: {zh: "写 lawEnforced", en: "write lawEnforced"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.conflict-id-a5df4d18
    to_api: "rpc:conflict-id-a5df4d18:write-__restore"
    label: {zh: "写 conflictId", en: "write conflictId"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.conflict-resolved-5ab5b3ad
    to_api: "rpc:conflict-resolved-5ab5b3ad:write-__restore"
    label: {zh: "写 conflictResolved", en: "write conflictResolved"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.norm-violated-e2fb976f
    to_api: "rpc:norm-violated-e2fb976f:write-__restore"
    label: {zh: "写 normViolated", en: "write normViolated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.meme-mutated-501a5287
    to_api: "rpc:meme-mutated-501a5287:write-__restore"
    label: {zh: "写 memeMutated", en: "write memeMutated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.collapse-handled-cf6b502a
    to_api: "rpc:collapse-handled-cf6b502a:write-__restore"
    label: {zh: "写 collapseHandled", en: "write collapseHandled"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.first-collapse-66252b50
    to_api: "rpc:first-collapse-66252b50:write-__restore"
    label: {zh: "写 firstCollapse", en: "write firstCollapse"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.scarce-ticks-088efc14
    to_api: "rpc:scarce-ticks-088efc14:write-__restore"
    label: {zh: "写 scarceTicks", en: "write scarceTicks"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.laws-enacted-0c7d407e
    to_api: "rpc:laws-enacted-0c7d407e:write-__restore"
    label: {zh: "写 lawsEnacted", en: "write lawsEnacted"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.conflicts-resolved-86cba80a
    to_api: "rpc:conflicts-resolved-86cba80a:write-__restore"
    label: {zh: "写 conflictsResolved", en: "write conflictsResolved"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.rituals-held-c80f5be2
    to_api: "rpc:rituals-held-c80f5be2:write-__restore"
    label: {zh: "写 ritualsHeld", en: "write ritualsHeld"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.norms-violated-de50e530
    to_api: "rpc:norms-violated-de50e530:write-__restore"
    label: {zh: "写 normsViolated", en: "write normsViolated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.memes-mutated-ace2d86a
    to_api: "rpc:memes-mutated-ace2d86a:write-__restore"
    label: {zh: "写 memesMutated", en: "write memesMutated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.breakdowns-d0633c4b
    to_api: "rpc:breakdowns-d0633c4b:write-__restore"
    label: {zh: "写 breakdowns", en: "write breakdowns"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.recoveries-604427c0
    to_api: "rpc:recoveries-604427c0:write-__restore"
    label: {zh: "写 recoveries", en: "write recoveries"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.copings-42356782
    to_api: "rpc:copings-42356782:write-__restore"
    label: {zh: "写 copings", en: "write copings"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.researches-started-b0336a4f
    to_api: "rpc:researches-started-b0336a4f:write-__restore"
    label: {zh: "写 researchesStarted", en: "write researchesStarted"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.researches-completed-cae00af3
    to_api: "rpc:researches-completed-cae00af3:write-__restore"
    label: {zh: "写 researchesComplete", en: "write researchesComplete"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.techs-lost-c5ad9d42
    to_api: "rpc:techs-lost-c5ad9d42:write-__restore"
    label: {zh: "写 techsLost", en: "write techsLost"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.collapses-64c48635
    to_api: "rpc:collapses-64c48635:write-__restore"
    label: {zh: "写 collapses", en: "write collapses"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.restarts-0484992f
    to_api: "rpc:restarts-0484992f:write-__restore"
    label: {zh: "写 restarts", en: "write restarts"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.op-seq-17675579
    to_api: "rpc:op-seq-17675579:write-__restore"
    label: {zh: "写 opSeq", en: "write opSeq"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.laya-urgency-cache-41855253
    to_api: "rpc:laya-urgency-cache-41855253:write-__restore"
    label: {zh: "写 layaUrgencyCache", en: "write layaUrgencyCache"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.forage-pool-5d0cee59
    to_api: "rpc:forage-pool-5d0cee59:write-__restore"
    label: {zh: "写 foragePool", en: "write foragePool"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.current-seed-ffaa622b
    to_api: "rpc:current-seed-ffaa622b:write-__restore"
    label: {zh: "写 currentSeed", en: "write currentSeed"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.in-flight-53dcc34c
    to_api: "rpc:in-flight-53dcc34c:write-__restore"
    label: {zh: "写 inFlight", en: "write inFlight"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.committed-tick-5c00f420
    to_api: "rpc:committed-tick-5c00f420:write-__restore"
    label: {zh: "写 committedTick", en: "write committedTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.in-flight-tick-d0b17941
    to_api: "rpc:in-flight-tick-d0b17941:write-__restore"
    label: {zh: "写 inFlightTick", en: "write inFlightTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.stage-error-f79c4049
    to_api: "rpc:stage-error-f79c4049:write-__restore"
    label: {zh: "写 stageError", en: "write stageError"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.stage-failure-94c90399
    to_api: "rpc:stage-failure-94c90399:write-__restore"
    label: {zh: "写 stageFailure", en: "write stageFailure"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.literate-set-72b44b99
    to_api: "rpc:literate-set-72b44b99:write-__restore"
    label: {zh: "写 literateSet", en: "write literateSet"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.mortality-4ab46b0e
    to_api: "rpc:mortality-4ab46b0e:write-__restore"
    label: {zh: "写 mortality", en: "write mortality"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.entities-5d3ec8fd
    to_api: "rpc:entities-5d3ec8fd:write-__restore"
    label: {zh: "写 entities", en: "write entities"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.by-id-fde1e42c
    to_api: "rpc:by-id-fde1e42c:write-__restore"
    label: {zh: "写 byId", en: "write byId"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.last-generation-b243beda
    to_api: "rpc:last-generation-b243beda:write-__restore"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.by-agent-2dd1f55b
    to_api: "rpc:by-agent-2dd1f55b:write-__restore"
    label: {zh: "写 byAgent", en: "write byAgent"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.last-generation-a3b1fa91
    to_api: "rpc:last-generation-a3b1fa91:write-__restore"
    label: {zh: "写 lastGeneration", en: "write lastGeneration"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.size-72779cf8
    to_api: "rpc:size-72779cf8:write-__restore"
    label: {zh: "写 size", en: "write size"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.grid-82f106b5
    to_api: "rpc:grid-82f106b5:write-__restore"
    label: {zh: "写 grid", en: "write grid"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.initialized-048bc601
    to_api: "rpc:initialized-048bc601:write-__restore"
    label: {zh: "写 initialized", en: "write initialized"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.current-ee9fa3e5
    to_api: "rpc:current-ee9fa3e5:write-__restore"
    label: {zh: "写 current", en: "write current"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.residents-bf48cede
    to_api: "rpc:residents-bf48cede:write-__restore"
    label: {zh: "写 residents", en: "write residents"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.quarantined-7d0301dd
    to_api: "rpc:quarantined-7d0301dd:write-__restore"
    label: {zh: "写 quarantined", en: "write quarantined"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.residents-99016ca8
    to_api: "rpc:residents-99016ca8:write-__restore"
    label: {zh: "写 residents", en: "write residents"}
---
