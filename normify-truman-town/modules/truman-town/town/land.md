---
uid: 94a21430
id: truman-town.town.land
parent: truman-town.town
state: deprecated
replacement: truman-town.town.map.zoning
name: {zh: "土地", en: "Land"}
description:
  zh: >
      （已废弃，能力由 truman-town.town.map.zoning 承担：zoning.assign/rezone/query 负责土地用途划分与变更。保留此条目以记录设计意图的归属。）
  en: >
      Deprecated: this capability lives in truman-town.town.map.zoning. Kept to record where the original intent ended up.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-26T03:30:35.489Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "town.land.acquire"
    description:
      zh: >
          调用 town.land.acquire。
          
      en: >
          Calls town.land.acquire.
          
  - protocol: rpc
    path: "town.land.transfer"
    description:
      zh: >
          调用 town.land.transfer。
          
      en: >
          Calls town.land.transfer.
          
---
