---
uid: 6e6ce413
id: truman-town.infra.config
parent: truman-town.infra
name: {zh: "配置管理", en: "Config"}
description:
  zh: >
      统一读写沙盘运行参数（点分 key，持久化到图存储），并提供外提参数的默认值快照（defaults）、校验（validate）与合并（resolve）。
      
  en: >
      Reads and writes sandbox runtime parameters (dotted keys, persisted into the graph store), and exposes a defaults snapshot, validation and merge for externalized parameters.
      
revision: 45f6c8b7b8ba210fcd94506b2097c8e601dd1382
updated_at: "2026-09-26T01:40:46.602Z"
fingerprint: bf063e4d4c7df5b198094571c5997c1918ed15394e400e452ed252ec114c0035
source:
  - path: "src/infra/config.js"
apis:
  - protocol: rpc
    path: "infra.config.get"
    description:
      zh: >
          读取全部或指定 key 的沙盘运行参数。
          
      en: >
          Reads all or a specific sandbox runtime parameter by key.
          
  - protocol: rpc
    path: "infra.config.set"
    description:
      zh: >
          写入单个运行参数（key/value），持久化到图存储。
          
      en: >
          Writes a single runtime parameter (key/value), persisted into the graph store.
          
  - protocol: rpc
    path: "infra.config.setMany"
    description:
      zh: >
          批量合并运行参数（对象形式）。
          
      en: >
          Bulk-merges runtime parameters (object form).
          
  - protocol: rpc
    path: "infra.config.defaults"
    description:
      zh: >
          返回全部外提参数的默认值快照（深拷贝）。
          
      en: >
          Returns a deep-copied snapshot of all externalized parameter defaults.
          
  - protocol: rpc
    path: "infra.config.validate"
    description:
      zh: >
          校验一组参数覆盖（只校验已知键，忽略未知键）。
          
      en: >
          Validates a set of parameter overrides (known keys only, unknown keys ignored).
          
  - protocol: rpc
    path: "infra.config.resolve"
    description:
      zh: >
          把参数覆盖深度合并到默认值并校验，返回生效配置。
          
      en: >
          Deep-merges overrides onto defaults and validates, returning the effective config.
          
  - protocol: rpc
    path: "infra.config.difficultyIds"
    description:
      zh: >
          返回全部可用难度档位 id。
          
      en: >
          Returns all available difficulty preset ids.
          
  - protocol: rpc
    path: "infra.config.difficultyPresets"
    description:
      zh: >
          返回全部难度档位深拷贝（含参数与预期表现）。
          
      en: >
          Returns a deep copy of all difficulty presets (params + expected survival).
          
  - protocol: rpc
    path: "infra.config.difficultyParams"
    description:
      zh: >
          返回指定档位的运行参数（未知档位返回 null）。
          
      en: >
          Returns a preset's run parameters (null for unknown id).
          
  - protocol: rpc
    path: "infra.config.getDifficulty"
    description:
      zh: >
          返回当前难度档位快照（id/label/expected/params）。
          
      en: >
          Returns the current difficulty snapshot (id/label/expected/params).
          
  - protocol: rpc
    path: "infra.config.setDifficulty"
    description:
      zh: >
          切换当前难度档位（未知档位抛 RangeError）。
          
      en: >
          Switches the current difficulty preset (RangeError on unknown id).
          
  - protocol: rpc
    path: "infra.config.currentDifficultyParams"
    description:
      zh: >
          返回当前档位运行参数（供 loop 叠加为基础参数）。
          
      en: >
          Returns the current preset run params (used as base params by the loop).
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
