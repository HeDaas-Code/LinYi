---
uid: af743e16
id: truman-town.observer.export
parent: truman-town.observer
state: planned
name: {zh: "观察导出", en: "Observer Export"}
description:
  zh: >
      把编年志与审计结果导出为报告或 Markdown。
  en: >
      Exports chronicles and audits as reports or Markdown.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:55:51Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "observer.export.report"
    description:
      zh: >
          调用 observer.export.report。
      en: >
          Calls observer.export.report.
  - protocol: rpc
    path: "observer.export.markdown"
    description:
      zh: >
          调用 observer.export.markdown。
      en: >
          Calls observer.export.markdown.
deps:
  - kind: call
    to: truman-town.observer.timeline
  - kind: call
    to: truman-town.observer.audit
---
