---
uid: b4743247
id: truman-town.runtime.world-state
parent: truman-town.runtime
name: {zh: "世界状态", en: "World State"}
description:
  zh: >
      保存与恢复世界快照，支持状态比对与内循环回滚。
      
  en: >
      Stores and restores world snapshots with diff and rollback support.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.383Z"
fingerprint: 1dd4be91cefe1c814932556aaa5e4e5267e40ab7ee4afa40a0f4c009c16bf688
source:
  - path: "src/runtime/world-state.js"
apis:
  - protocol: rpc
    path: "runtime.world_state.snapshot"
    description:
      zh: >
          返回当前世界状态的深拷贝快照。
          
      en: >
          Returns a deep-copied snapshot of the current world state.
          
  - protocol: rpc
    path: "runtime.world_state.diff"
    description:
      zh: >
          计算两份快照之间的叶子粒度结构化差异（added/changed/removed）。
          
      en: >
          Computes leaf-level structural diff (added/changed/removed) between two snapshots.
          
  - protocol: rpc
    path: "runtime.world_state.restore"
    description:
      zh: >
          用一份快照整体替换当前状态，实现回滚/恢复。
          
      en: >
          Replaces the current state with a snapshot for rollback/restore.
          
---
