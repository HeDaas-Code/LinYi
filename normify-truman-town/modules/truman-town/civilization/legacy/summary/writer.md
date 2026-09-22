---
uid: 6c2f2ec7
id: truman-town.civilization.legacy.summary.writer
parent: truman-town.civilization.legacy.summary
name: {zh: "遗产撰写器", en: "Legacy Writer"}
description:
  zh: >
      用 LLM 生成 200-500 字文明遗产描述。
      
  en: >
      Generates a 200-500 word legacy description via LLM.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:39:19.573Z"
fingerprint: fab7bb016e23d21ea587685d24e6b985fb93b771987edbcb09169b6ad884eb55
source:
  - path: "src/civilization/legacy/summary/writer.js"
apis:
  - protocol: rpc
    path: "civilization.legacy.summary.writer.generate"
    description:
      zh: >
          调用 civilization.legacy.summary.writer.generate。
          
      en: >
          Calls civilization.legacy.summary.writer.generate.
          
  - protocol: rpc
    path: "civilization.legacy.summary.writer.constrain"
    description:
      zh: >
          调用 civilization.legacy.summary.writer.constrain。
          
      en: >
          Calls civilization.legacy.summary.writer.constrain.
          
deps:
  - kind: call
    to: truman-town.civilization.legacy.summary.extractor
  - kind: call
    to: truman-town.ai.llm.gateway
---
