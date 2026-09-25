---
uid: 37a9110a
id: truman-town-flow.code.runtime.orchestrator.stage3
parent: truman-town-flow.code.runtime.orchestrator
name: {zh: "runtime/orchestrator/_stage3.js", en: "runtime/orchestrator/_stage3.js"}
description:
  zh: >
      代码模块 src/runtime/orchestrator/_stage3.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/orchestrator/_stage3.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:48.777Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.allied-3f55bd00
    to_api: "rpc:allied-3f55bd00:write-runPolitics"
    label: {zh: "写 allied", en: "write allied"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.law-enforced-7da3ebf7
    to_api: "rpc:law-enforced-7da3ebf7:write-runPolitics"
    label: {zh: "写 lawEnforced", en: "write lawEnforced"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.conflict-id-a5df4d18
    to_api: "rpc:conflict-id-a5df4d18:write-runPolitics"
    label: {zh: "写 conflictId", en: "write conflictId"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.conflict-resolved-5ab5b3ad
    to_api: "rpc:conflict-resolved-5ab5b3ad:write-runPolitics"
    label: {zh: "写 conflictResolved", en: "write conflictResolved"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.norm-violated-e2fb976f
    to_api: "rpc:norm-violated-e2fb976f:write-runCulture"
    label: {zh: "写 normViolated", en: "write normViolated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.meme-mutated-501a5287
    to_api: "rpc:meme-mutated-501a5287:write-runCulture"
    label: {zh: "写 memeMutated", en: "write memeMutated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.collapse-handled-cf6b502a
    to_api: "rpc:collapse-handled-cf6b502a:write-runCivilization"
    label: {zh: "写 collapseHandled", en: "write collapseHandled"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.first-collapse-66252b50
    to_api: "rpc:first-collapse-66252b50:write-runCivilization"
    label: {zh: "写 firstCollapse", en: "write firstCollapse"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.scarce-ticks-088efc14
    to_api: "rpc:scarce-ticks-088efc14:write-runCivilization"
    label: {zh: "写 scarceTicks", en: "write scarceTicks"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.laws-enacted-0c7d407e
    to_api: "rpc:laws-enacted-0c7d407e:write-runPolitics"
    label: {zh: "写 lawsEnacted", en: "write lawsEnacted"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.conflicts-resolved-86cba80a
    to_api: "rpc:conflicts-resolved-86cba80a:write-runPolitics"
    label: {zh: "写 conflictsResolved", en: "write conflictsResolved"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.rituals-held-c80f5be2
    to_api: "rpc:rituals-held-c80f5be2:write-runCulture"
    label: {zh: "写 ritualsHeld", en: "write ritualsHeld"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.norms-violated-de50e530
    to_api: "rpc:norms-violated-de50e530:write-runCulture"
    label: {zh: "写 normsViolated", en: "write normsViolated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.memes-mutated-ace2d86a
    to_api: "rpc:memes-mutated-ace2d86a:write-runCulture"
    label: {zh: "写 memesMutated", en: "write memesMutated"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.breakdowns-d0633c4b
    to_api: "rpc:breakdowns-d0633c4b:write-runPsyche"
    label: {zh: "写 breakdowns", en: "write breakdowns"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.recoveries-604427c0
    to_api: "rpc:recoveries-604427c0:write-runPsyche"
    label: {zh: "写 recoveries", en: "write recoveries"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.copings-42356782
    to_api: "rpc:copings-42356782:write-runPsyche"
    label: {zh: "写 copings", en: "write copings"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.researches-started-b0336a4f
    to_api: "rpc:researches-started-b0336a4f:write-runTech"
    label: {zh: "写 researchesStarted", en: "write researchesStarted"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.researches-completed-cae00af3
    to_api: "rpc:researches-completed-cae00af3:write-runTech"
    label: {zh: "写 researchesComplete", en: "write researchesComplete"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.techs-lost-c5ad9d42
    to_api: "rpc:techs-lost-c5ad9d42:write-runTech"
    label: {zh: "写 techsLost", en: "write techsLost"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.collapses-64c48635
    to_api: "rpc:collapses-64c48635:write-runCivilization"
    label: {zh: "写 collapses", en: "write collapses"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.restarts-0484992f
    to_api: "rpc:restarts-0484992f:write-runCivilization"
    label: {zh: "写 restarts", en: "write restarts"}
---
