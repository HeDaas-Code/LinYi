---
uid: 8a61e92b
id: truman-town.civilization.restart
parent: truman-town.civilization
name: {zh: "文明重启", en: "Civilization Restart"}
description:
  zh: >
      执行沙盒重启，并把上一代文明遗产注入新文明。
      
  en: >
      Restarts the sandbox and injects the previous civilization's legacy into the new one.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.834Z"
fingerprint: 72c03347b405a984190fd6265277f5c239c9e4f61b85b85952e538c730958262
source:
  - path: "src/civilization/restart.js"
apis:
  - protocol: rpc
    path: "civilization.restart.execute"
    description:
      zh: >
          调用 civilization.restart.execute。
          
      en: >
          Calls civilization.restart.execute.
          
  - protocol: rpc
    path: "civilization.restart.inherit"
    description:
      zh: >
          调用 civilization.restart.inherit。
          
      en: >
          Calls civilization.restart.inherit.
          
deps:
  - kind: call
    to: truman-town.infra.store.archive
  - kind: call
    to: truman-town.civilization.legacy.summary
  - kind: call
    to: truman-town.town.map.topology
---
