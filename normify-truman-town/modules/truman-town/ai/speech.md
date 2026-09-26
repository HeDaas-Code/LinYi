---
uid: 7bffb0cc
id: truman-town.ai.speech
parent: truman-town.ai
state: deprecated
replacement: truman-town.runtime.orchestrator.stage2
name: {zh: "对话生成", en: "Speech Generation"}
description:
  zh: >
      （已废弃，能力由 truman-town.runtime.orchestrator.stage2 承担：对话正文由 stage2 的 situationOf 按处境与人格合成。保留此条目以记录设计意图的归属。）
  en: >
      Deprecated: this capability lives in truman-town.runtime.orchestrator.stage2. Kept to record where the original intent ended up.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-26T03:30:40.041Z"
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
