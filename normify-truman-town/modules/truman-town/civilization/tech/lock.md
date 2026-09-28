---
uid: c7ccd2fd
id: truman-town.civilization.tech.lock
parent: truman-town.civilization.tech
name: {zh: "技术遗忘", en: "Tech Loss"}
description:
  zh: >
      当掌握者死亡且无人继承时，技术节点被锁定甚至遗忘。
      
  en: >
      Locks or forgets tech nodes when their holders die without successors.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.834Z"
fingerprint: 733ea94635d0378e1e6d76a88e125a8cc8db9efdb5b7c0887455223c79368f36
source:
  - path: "src/civilization/tech/lock.js"
apis:
  - protocol: rpc
    path: "civilization.tech.lock.detect"
    description:
      zh: >
          检测技术是否失传（掌握者全部死亡且无继承）。
          
      en: >
          Detects tech loss (holders all dead with no successor).
          
  - protocol: rpc
    path: "civilization.tech.lock.apply"
    description:
      zh: >
          锁定（失传）技术使其不可用，并写观察日志。
          
      en: >
          Applies the loss, locking the tech and logging.
          
deps:
  - kind: call
    to: truman-town.agent.lifecycle
  - kind: call
    to: truman-town.civilization.tech.tree
---
