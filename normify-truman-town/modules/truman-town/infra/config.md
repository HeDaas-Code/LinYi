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
      
revision: 8f46bbe36535fe49a2418c2f4d3f1c829c12ce06
updated_at: "2026-09-22T16:53:11.998Z"
fingerprint: 3111564f008971f5818e29771248be45c7d0dc87fdf0a2d3d54f31c257203a6e
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
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
