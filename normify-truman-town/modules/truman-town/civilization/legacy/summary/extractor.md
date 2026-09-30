---
uid: 042588d5
id: truman-town.civilization.legacy.summary.extractor
parent: truman-town.civilization.legacy.summary
name: {zh: "遗产提取器", en: "Legacy Extractor"}
description:
  zh: >
      从历史图谱提取关键事件、人物与成就。
      
  en: >
      Extracts key events, people and deeds from the legacy graph.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.834Z"
fingerprint: 3e4f0348eda4d63557cab24f834f629d778fc7aa4ac3bf7105fde0675f9c8e76
source:
  - path: "src/civilization/legacy/summary/extractor.js"
apis:
  - protocol: rpc
    path: "civilization.legacy.summary.extractor.extract"
    description:
      zh: >
          调用 civilization.legacy.summary.extractor.extract。
          
      en: >
          Calls civilization.legacy.summary.extractor.extract.
          
  - protocol: rpc
    path: "civilization.legacy.summary.extractor.events"
    description:
      zh: >
          调用 civilization.legacy.summary.extractor.events。
          
      en: >
          Calls civilization.legacy.summary.extractor.events.
          
deps:
  - kind: dataflow
    to: truman-town.civilization.legacy.graph
---
