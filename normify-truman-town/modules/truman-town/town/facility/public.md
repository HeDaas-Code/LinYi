---
uid: d267b833
id: truman-town.town.facility.public
parent: truman-town.town.facility
state: deprecated
replacement: truman-town.town.facility.venue
name: {zh: "公共设施", en: "Public Facility"}
description:
  zh: >
      （已废弃，能力由 truman-town.town.facility.venue 承担：venue.book/cancel/query 负责公共场地预约。保留此条目以记录设计意图的归属。）
  en: >
      Deprecated: this capability lives in truman-town.town.facility.venue. Kept to record where the original intent ended up.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-26T03:30:36.427Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "town.facility.public.register"
    description:
      zh: >
          调用 town.facility.public.register。
          
      en: >
          Calls town.facility.public.register.
          
  - protocol: rpc
    path: "town.facility.public.use"
    description:
      zh: >
          调用 town.facility.public.use。
          
      en: >
          Calls town.facility.public.use.
          
deps:
  - kind: call
    to: truman-town.town.building.space
---
