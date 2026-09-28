---
uid: bbab8cfa
id: truman-town.ai.llm.gateway
parent: truman-town.ai.llm
name: {zh: "模型调用", en: "Model Gateway"}
description:
  zh: >
      执行补全与嵌入请求，处理限流与重试。
      
  en: >
      Executes completion and embedding requests with rate limiting and retries.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.832Z"
fingerprint: 160aaa3be4edab87b9a0de7d71e65c522c956237ece1445ab5478fe616f1d030
source:
  - path: "src/ai/llm/gateway.js"
apis:
  - protocol: rpc
    path: "ai.llm.gateway.complete"
    description:
      zh: >
          执行一次 LLM 补全请求，支持可插拔 provider，内置限流与指数退避重试。
          
      en: >
          Executes an LLM completion request with pluggable providers, rate limiting and exponential-backoff retries.
          
  - protocol: rpc
    path: "ai.llm.gateway.embed"
    description:
      zh: >
          把文本列表编码为向量，返回确定性或模型生成的嵌入。
          
      en: >
          Encodes a list of texts into vectors, returning deterministic or model-generated embeddings.
          
---
