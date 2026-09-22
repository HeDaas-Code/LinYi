---
uid: a72b8fab
id: truman-town.observer.audit
parent: truman-town.observer
state: planned
name: {zh: "决策审计", en: "Decision Audit"}
description:
  zh: >
      回溯单个智能体的决策链，并对比不同个体的行为差异。
  en: >
      Traces individual decision chains and compares behavior across agents.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:55:51Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "observer.audit.trace"
    description:
      zh: >
          调用 observer.audit.trace。
      en: >
          Calls observer.audit.trace.
  - protocol: rpc
    path: "observer.audit.compare"
    description:
      zh: >
          调用 observer.audit.compare。
      en: >
          Calls observer.audit.compare.
deps:
  - kind: dataflow
    to: truman-town.observer.recorder
---
