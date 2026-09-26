---
uid: 3a5e8fa7
id: truman-town.civilization.archive
parent: truman-town.civilization
state: deprecated
replacement: truman-town.infra.store.archive
name: {zh: "文明存档", en: "Civilization Archive"}
description:
  zh: >
      （已废弃，能力由 truman-town.infra.store.archive 承担：archive.save/load/describe 负责存档读写；遗产继承见 civilization.restart.inherit。保留此条目以记录设计意图的归属。）
  en: >
      Deprecated: this capability lives in truman-town.infra.store.archive. Kept to record where the original intent ended up.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-26T03:30:38.251Z"
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
