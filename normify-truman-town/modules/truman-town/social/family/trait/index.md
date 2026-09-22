---
uid: 16b2e5fe
id: truman-town.social.family.trait
parent: truman-town.social.family
state: planned
name: {zh: "家族特质实现", en: "Family Trait Implementation"}
description:
  zh: >
      当某 tag 在家族内连续遗传三代未遗失，即固化为家族特质；家族最多 5 个特质。
  en: >
      Fixes a tag as a family trait when it survives three generations without loss; max 5 family traits.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:27:53Z"
fingerprint: pending
source: []
deps:
  - kind: call
    to: truman-town.social.family.lineage
  - kind: call
    to: truman-town.agent.traits.inherit
  - kind: call
    to: truman-town.agent.traits.tagset
---
