---
uid: a73bb8ce
id: truman-town.ai.llm.router
parent: truman-town.ai.llm
name: {zh: "模型路由", en: "Model Router"}
description:
  zh: >
      按任务类型选择模型并提供降级路由。
      
  en: >
      Routes tasks to models with fallback policies.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.832Z"
fingerprint: 3ba9b237eb7e769a926349c45f9efe5ddeb21c01e178ec3cd0a17e110b9beab9
source:
  - path: "src/ai/llm/router.js"
apis:
  - protocol: rpc
    path: "ai.llm.router.route"
    description:
      zh: >
          按任务类型选择 provider 与模型，返回路由决策。
          
      en: >
          Selects a provider and model by task type, returning a routing decision.
          
  - protocol: rpc
    path: "ai.llm.router.fallback"
    description:
      zh: >
          沿 provider 列表降级尝试补全/嵌入，前一个失败自动切到下一个。
          
      en: >
          Degrades across the provider list for completion/embedding, falling back on failure.
          
deps:
  - kind: call
    to: truman-town.ai.llm.gateway
---
