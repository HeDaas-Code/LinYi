---
uid: dcc4f06d
id: truman-town.api.archive
parent: truman-town.api
state: deprecated
replacement: truman-town.infra.store.archive
name: {zh: "存档接口", en: "Archive API"}
description:
  zh: >
      （已废弃，能力由 truman-town.infra.store.archive 承担：archive.save/load/describe 负责存档读写。保留此条目以记录设计意图的归属。）
  en: >
      Deprecated: this capability lives in truman-town.infra.store.archive. Kept to record where the original intent ended up.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-26T03:30:37.734Z"
fingerprint: pending
source: []
apis:
  - protocol: http
    method: POST
    path: "/api/v1/archive/save"
    description:
      zh: >
          保存当前沙盘存档。
          
      en: >
          Saves the current archive.
          
  - protocol: http
    method: POST
    path: "/api/v1/archive/load"
    description:
      zh: >
          加载指定沙盘存档。
          
      en: >
          Loads a specified archive.
          
deps:
  - kind: call
    to: truman-town.infra.store.archive
---
