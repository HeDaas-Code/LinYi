---
uid: 1a98b26f
id: truman-town.observer.experiment.counterfactual
parent: truman-town.observer.experiment
name: {zh: "反事实", en: "Counterfactual"}
description:
  zh: >
      以已记录决策为锚点创建反事实分支并比较"如果当时不这样做"的差异，只读。
      
  en: >
      Branches counterfactual alternatives anchored on recorded decisions and compares what-if divergences; read-only.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:35:46.718Z"
fingerprint: 2b14c01ab1e651c191e84a91e236de18b3711cf832c9b24f1cfca3d1208d94e8
source:
  - path: "src/observer/experiment/counterfactual.js"
apis:
  - protocol: rpc
    path: "observer.experiment.counterfactual.branch"
    description:
      zh: >
          以已记录决策为锚点创建反事实分支。
          
      en: >
          Creates a counterfactual branch anchored on a recorded decision.
          
  - protocol: rpc
    path: "observer.experiment.counterfactual.compare"
    description:
      zh: >
          比较原决策与备选决策的差异（投影 + 下游证据）。
          
      en: >
          Compares original vs alternative decision (projection + downstream evidence).
          
deps:
  - kind: call
    to: truman-town.observer.recorder
    label: {zh: "读取决策/行为日志", en: "Read decision/action logs"}
---
