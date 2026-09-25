---
uid: af743e16
id: truman-town.observer.export
parent: truman-town.observer
name: {zh: "观察导出", en: "Observer Export"}
description:
  zh: >
      把编年志与审计结果导出为报告或 Markdown。
      
  en: >
      Exports chronicles and audits as reports or Markdown.
      
revision: 796aec9412d132997f5cdc37d01cac934e03d018
updated_at: "2026-09-25T10:03:44.359Z"
fingerprint: d152d2681f1cad1e8369ea06b7a029f1aa8496bd7d770508f4a89574359143be
source:
  - path: "src/observer/export.js"
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
