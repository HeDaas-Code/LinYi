---
uid: 0ca24fcf
id: truman-town.agent.decision.explainer
parent: truman-town.agent.decision
name: {zh: "决策解释器", en: "Decision Explainer"}
description:
  zh: >
      解释决策依据并生成可被观察者审计的决策轨迹。
      
  en: >
      Explains decisions and produces auditable decision traces.
      
revision: 159dc43daf11d18b03ea9fc0ea5c3e6b18f16488
updated_at: "2026-09-24T02:31:02.018Z"
fingerprint: ca1556bf9ff32886e3a4350fa156921089687f3751db6a6a3863bb9433a77f9e
source:
  - path: "src/agent/decision/explainer.js"
apis:
  - protocol: rpc
    path: "agent.decision.explainer.explain"
    description:
      zh: >
          生成人类可读决策解释（为何选 A 不选 B）。
          
      en: >
          Generates human-readable decision explanation (why A over B).
          
  - protocol: rpc
    path: "agent.decision.explainer.trace"
    description:
      zh: >
          生成可审计的结构化决策轨迹。
          
      en: >
          Produces an auditable structured decision trace.
          
deps:
  - kind: call
    to: truman-town.agent.decision.selector
  - kind: call
    to: truman-town.observer.recorder
---
