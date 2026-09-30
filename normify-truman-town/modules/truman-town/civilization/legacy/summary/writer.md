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
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.834Z"
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
