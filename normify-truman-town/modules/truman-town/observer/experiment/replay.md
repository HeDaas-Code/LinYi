---
uid: c84373f6
id: truman-town.observer.experiment.replay
parent: truman-town.observer.experiment
name: {zh: "回放", en: "Replay"}
description:
  zh: >
      按编年志重演任意时间段的因果链，按 seed 生成确定性回放 run id，只读不修改世界状态。
      
  en: >
      Replays causal chains of any period from the chronicle, with a seed-derived deterministic run id; read-only.
      
revision: 5ad9af8b020cb978dad9c8ac59c41cdb224d5c73
updated_at: "2026-09-22T17:24:01.916Z"
fingerprint: 4c44d957a3f9db3df310bfd9c0312a232469916a7e863643fb682d4d9e16e93b
source:
  - path: "src/observer/experiment/replay.js"
apis:
  - protocol: rpc
    path: "observer.experiment.replay.run"
    description:
      zh: >
          按 seed 回放指定区间因果链，返回确定性 run id 与有序条目。
          
      en: >
          Replays the causal chain for a range, keyed by seed with a deterministic run id.
          
  - protocol: rpc
    path: "observer.experiment.replay.query"
    description:
      zh: >
          只读查询指定区间的因果链窗口。
          
      en: >
          Reads a causal-chain window for a range (read-only).
          
deps:
  - kind: call
    to: truman-town.observer.chronicle.compiler
    label: {zh: "读取编年志", en: "Read chronicle"}
---
