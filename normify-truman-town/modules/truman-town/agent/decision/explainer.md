---
uid: 0ca24fcf
id: truman-town.agent.decision.explainer
parent: truman-town.agent.decision
state: planned
name: {zh: "决策解释器", en: "Decision Explainer"}
description:
  zh: >
      解释决策依据并生成可被观察者审计的决策轨迹。
  en: >
      Explains decisions and produces auditable decision traces.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:27:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent.decision.explainer.explain"
    description:
      zh: >
          调用 agent.decision.explainer.explain。
      en: >
          Calls agent.decision.explainer.explain.
  - protocol: rpc
    path: "agent.decision.explainer.trace"
    description:
      zh: >
          调用 agent.decision.explainer.trace。
      en: >
          Calls agent.decision.explainer.trace.
deps:
  - kind: call
    to: truman-town.agent.decision.selector
  - kind: call
    to: truman-town.observer.recorder
---
