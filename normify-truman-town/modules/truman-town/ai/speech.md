---
uid: 7bffb0cc
id: truman-town.ai.speech
parent: truman-town.ai
state: planned
name: {zh: "对话生成", en: "Speech Generation"}
description:
  zh: >
      生成社交平台与面对面交流的对话内容。
  en: >
      Generates dialogue for social platforms and face-to-face talk.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "ai.speech.generate"
    description:
      zh: >
          调用 ai.speech.generate。
      en: >
          Calls ai.speech.generate.
  - protocol: rpc
    path: "ai.speech.polish"
    description:
      zh: >
          调用 ai.speech.polish。
      en: >
          Calls ai.speech.polish.
deps:
  - kind: call
    to: truman-town.ai.llm.gateway
---
