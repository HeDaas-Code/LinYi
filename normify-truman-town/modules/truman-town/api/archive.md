---
uid: dcc4f06d
id: truman-town.api.archive
parent: truman-town.api
state: planned
name: {zh: "存档接口", en: "Archive API"}
description:
  zh: >
      保存与加载沙盘存档。
  en: >
      Saves and loads sandbox archives.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
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
