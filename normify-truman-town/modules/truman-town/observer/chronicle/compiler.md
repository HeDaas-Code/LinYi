---
uid: dc9301d5
id: truman-town.observer.chronicle.compiler
parent: truman-town.observer.chronicle
name: {zh: "编年编译器", en: "Chronicle Compiler"}
description:
  zh: >
      把原始决策/行为/事件日志按时间桶编译为编年志。
      
  en: >
      Compiles raw decision/action/event logs into a time-bucketed chronicle.
      
revision: c153893ac2349a3e3a99e6331904bebe7274b479
updated_at: "2026-09-23T05:05:51.519Z"
fingerprint: efcaf2f16db1ba6052d8859012c6dc555bf437458ad37fd7b708c79e15343754
source:
  - path: "src/observer/chronicle/compiler.js"
apis:
  - protocol: rpc
    path: "observer.chronicle.compiler.compile"
    description:
      zh: >
          读取原始日志并编译为按时间组织的编年志（含计数、分桶与时间线）。
          
      en: >
          Reads raw logs and compiles a time-organized chronicle (counts, buckets and timeline).
          
  - protocol: rpc
    path: "observer.chronicle.compiler.bucket"
    description:
      zh: >
          把日志条目按 tick 分桶（支持自定义桶大小）。
          
      en: >
          Buckets log entries by tick with a configurable bucket size.
          
deps:
  - kind: dataflow
    to: truman-town.observer.recorder
---
