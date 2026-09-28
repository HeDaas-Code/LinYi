---
uid: a3f81c25
id: truman-town.ai.decide
parent: truman-town.ai
tags: [ai, decision, llm, e2e]
name: {zh: "模型决策", en: "Model Decision"}
description:
  zh: >
      让真实大模型从居民当前可行候选集内选择行动，是「有模型 E2E」的入口：状态→候选集→模型选择→行动执行。模型不得新增行动或绕过可行性约束，解析失败或越界时回落确定性结果并记录原因。
      
  en: >
      Lets a real LLM pick an action from the agent feasible candidate set; the LLM-in-the-loop entry point. No invented actions or bypassed feasibility.
      
revision: 4aa30ac21fd7f498d4c759a5b139d7f84a412acc
updated_at: "2026-09-28T10:38:40.020Z"
fingerprint: 0a3de1cb49e4e7cd82b56c70cfbe25b40350659699a99c15529fb5252200bc94
source:
  - path: "src/ai/decide.js"
apis:
  - protocol: rpc
    path: "ai.decide.composePrompt"
    description:
      zh: >
          组装决策提示词：处境 + 候选行动（含可行性理由）。
          
      en: >
          Builds the decision prompt with situation and candidates.
          
  - protocol: rpc
    path: "ai.decide.parseAction"
    description:
      zh: >
          从模型自由文本中提取行动名，容忍标点/引号/大小写/前后缀。
          
      en: >
          Extracts an action name from free-form model text.
          
  - protocol: rpc
    path: "ai.decide.choose"
    description:
      zh: >
          调用模型做一次行动选择，返回 action 与调用元数据。
          
      en: >
          Calls the model once to choose an action.
          
deps:
  - kind: call
    to: truman-town.ai.llm.gateway
    label: {zh: "经网关执行补全", en: "Completes via gateway"}
---
