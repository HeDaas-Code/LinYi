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
      
revision: 9885f1e507ec4ef5a3c1f8c166ed456cf0026737
updated_at: "2026-09-24T19:40:06.129Z"
fingerprint: 243e44fe25c8edb2c3e086a38afcc9ac3d4b30e857fcd8cb2a279ef4f55f9879
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
