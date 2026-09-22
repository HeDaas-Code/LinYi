---
uid: d5d3a6aa
id: truman-town.social.culture.ritual
parent: truman-town.social.culture
name: {zh: "仪式", en: "Ritual"}
description:
  zh: >
      葬礼/丰收/命名/重启纪念等仪式的发起与举行，按周期触发并产生群体效果。
      
  en: >
      Holds funerals/harvests/naming/restart memorials, triggering periodically with group effects.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:22:57.360Z"
fingerprint: d6683ee0c4bd981d6e83e9bca3be5c2cbb2b9acd533a58104dada9285581b126
source:
  - path: "src/social/culture/ritual.js"
apis:
  - protocol: rpc
    path: "social.culture.ritual.hold"
    description:
      zh: >
          举行一场仪式（订馆 + 群体效果 + 写事件日志）。
          
      en: >
          Holds a ritual (venue booking + group effect + event log).
          
  - protocol: rpc
    path: "social.culture.ritual.schedule"
    description:
      zh: >
          注册一个按周期触发的仪式日程。
          
      en: >
          Registers a periodically-triggered ritual schedule.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
    label: {zh: "持久化仪式日程", en: "Persist schedules"}
  - kind: call
    to: truman-town.town.facility.venue
    label: {zh: "预订仪式场馆", en: "Book venue"}
  - kind: call
    to: truman-town.observer.recorder
    label: {zh: "写事件日志", en: "Write event log"}
---
