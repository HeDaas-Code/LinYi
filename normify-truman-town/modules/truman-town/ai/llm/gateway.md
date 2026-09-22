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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:18:02.555Z"
fingerprint: eca8474394e74ccd94bd089dee39c573451e27c35c6b26ffb345a0320dc97a0e
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
