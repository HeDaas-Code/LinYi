---
uid: 6e6ce413
id: truman-town.infra.config
parent: truman-town.infra
name: {zh: "配置管理", en: "Config"}
description:
  zh: >
      读取与更新沙盘运行参数。
      
  en: >
      Reads and updates sandbox runtime parameters.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:45:38.725Z"
fingerprint: 8c922863ec310c082b62aa0b913abd57a24dacd36e0b46e331d6f52f031300df
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
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
