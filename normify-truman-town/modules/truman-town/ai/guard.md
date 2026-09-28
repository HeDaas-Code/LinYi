---
uid: bee1ac0f
id: truman-town.ai.guard
parent: truman-town.ai
name: {zh: "安全护栏", en: "AI Guard"}
description:
  zh: >
      检查生成内容的安全性与世界观一致性。
      
  en: >
      Checks generated content for safety and worldview consistency.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T09:00:32.042Z"
fingerprint: d6ac8b2f6080d4cbc46aabd84f828bfd8d5873c1c419ac21b2c6980eb4184bd3
source:
  - path: "src/ai/guard.js"
apis:
  - protocol: rpc
    path: "ai.guard.check"
    description:
      zh: >
          检查文本或消息中的注入和世界观规则。
          
      en: >
          检查文本或消息中的注入和世界观规则。
          
  - protocol: rpc
    path: "ai.guard.sanitize"
    description:
      zh: >
          返回经过护栏规则净化的文本或消息。
          
      en: >
          返回经过护栏规则净化的文本或消息。
          
---
