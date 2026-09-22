---
uid: 3a5e8fa7
id: truman-town.civilization.archive
parent: truman-town.civilization
state: planned
name: {zh: "文明存档", en: "Civilization Archive"}
description:
  zh: >
      把文明遗产与全部历史存档，供重启后读取。
  en: >
      Archives the legacy and full history for post-restart access.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:55:51Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "civilization.archive.save"
    description:
      zh: >
          调用 civilization.archive.save。
      en: >
          Calls civilization.archive.save.
  - protocol: rpc
    path: "civilization.archive.load"
    description:
      zh: >
          调用 civilization.archive.load。
      en: >
          Calls civilization.archive.load.
deps:
  - kind: call
    to: truman-town.infra.store.archive
  - kind: call
    to: truman-town.civilization.legacy.summary
---
