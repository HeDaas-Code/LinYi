---
uid: e5a52839
id: truman-town-flow.machines.list.civilization-lifecycle-cf9508be
parent: truman-town-flow.machines.list
name: {zh: "civilization.lifecycle（存续 → 疑似崩溃 → 已确认 → 已重启）", en: "civilization.lifecycle"}
description:
  zh: >
      存续→疑似崩溃：collapse.detector.detect() 任一路径触发；疑似崩溃→已确认：collapse.confirmer.confirm()；已确认→已重启：restart.execute() 注入遗产并开新一代。注意：resource_exhausted 需**持续** collapsedScarceTicks 才计入；单 tick 见底是水位振荡的正常谷底（e63b932 修复）
  en: >
      civilization.lifecycle state machine with 3 transitions
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "civilization-lifecycle-cf9508be:t0_存续_to_疑似崩溃"
    description:
      zh: >
          collapse.detector.detect() 任一路径触发 @src/civilization/collapse/detector.js:44
      en: >
          collapse.detector.detect() 任一路径触发
  - protocol: rpc
    path: "civilization-lifecycle-cf9508be:t1_疑似崩溃_to_已确认"
    description:
      zh: >
          collapse.confirmer.confirm() @src/civilization/collapse/confirmer.js
      en: >
          collapse.confirmer.confirm()
  - protocol: rpc
    path: "civilization-lifecycle-cf9508be:t2_已确认_to_已重启"
    description:
      zh: >
          restart.execute() 注入遗产并开新一代 @src/civilization/restart.js:59
      en: >
          restart.execute() 注入遗产并开新一代
---
