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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:14:27.005Z"
fingerprint: 8ed711bd64b5e5bde537d59c47f2d92e29f77b19edfa203f043592310c250e41
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
