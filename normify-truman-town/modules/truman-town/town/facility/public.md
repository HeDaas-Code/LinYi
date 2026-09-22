---
uid: d267b833
id: truman-town.town.facility.public
parent: truman-town.town.facility
state: planned
name: {zh: "公共设施", en: "Public Facility"}
description:
  zh: >
      登记公园、医院、学校等公共设施并记录使用。
  en: >
      Registers and uses parks, hospitals and schools.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
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
