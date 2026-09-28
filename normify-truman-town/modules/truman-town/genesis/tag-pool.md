---
uid: a7f3c21e
id: truman-town.genesis.tag-pool
parent: truman-town.genesis
tags: [genesis, traits, data]
name: {zh: "特质标签池", en: "Trait Tag Pool"}
description:
  zh: >
      50 条特质标签的取值池：12 个维度 / 55 个候选值。每位居民持有一条 50 标签串；子代的 50 标签由父母双方共 100 标签中随机取用组成。零依赖纯数据模块，是遗传与提示词组装共同的事实来源。
      
  en: >
      Value pool for the 50-trait tag string: 12 dimensions, 55 candidate values. Each resident holds one 50-tag string; offspring tags are randomly composed from the parents 100 tags. Zero-dependency pure-data module, shared source of truth for heredity and prompt assembly.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.835Z"
fingerprint: c33f8e1c48831920ce68a6ebbcaf8408a28633d44a85dd9d2856186323e4106d
source:
  - path: "src/genesis/tag-pool.js"
apis:
  - protocol: rpc
    path: "genesis.tag-pool.makeKey"
    description:
      zh: >
          按维度与取值拼出标签 key。
          
      en: >
          Builds a tag key from dimension and value.
          
  - protocol: rpc
    path: "genesis.tag-pool.dimensionOf"
    description:
      zh: >
          由标签 key 反查所属维度。
          
      en: >
          Resolves the dimension a tag key belongs to.
          
  - protocol: rpc
    path: "genesis.tag-pool.candidates"
    description:
      zh: >
          列出候选标签，可按维度过滤。
          
      en: >
          Lists candidate tags, optionally filtered by dimension.
          
  - protocol: rpc
    path: "genesis.tag-pool.label"
    description:
      zh: >
          返回标签的可读名。
          
      en: >
          Returns the human-readable label of a tag key.
          
  - protocol: rpc
    path: "genesis.tag-pool.stats"
    description:
      zh: >
          返回池子规模统计（维度数 / 候选数 / 标签数）。
          
      en: >
          Returns pool size statistics (dimensions, candidates, tags).
          
---

## 职责

维护 12 个维度、55 个候选值构成的标签取值池，并为 50 条特质标签提供统一的
key 拼装与反查能力。

## 为什么是 50 条

50 标签串是居民身份的核心载体：它同时驱动人格、能力与行为倾向，
并作为代际遗传的传递单位 —— 子代从父母共 100 条标签中随机取 50 条组成自身标签串，
使「家族特征」有可能在若干代后稳定下来。

## 依赖

零依赖。被 genesis.heredity.tags、genesis.heredity.prompt 与
genesis.agent-factory.template 共同引用，是本树的事实来源。
