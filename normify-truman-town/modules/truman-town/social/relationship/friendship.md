---
uid: c9df858f
id: truman-town.social.relationship.friendship
parent: truman-town.social.relationship
name: {zh: "友谊关系", en: "Friendship"}
description:
  zh: >
      更新友谊强度与互动历史。
      
  en: >
      Updates friendship strength and interaction history.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.838Z"
fingerprint: f18be2d3be23aee5d20e55821846d28a22b53223839dff1ee0b20938147b2b18
source:
  - path: "src/social/relationship/friendship.js"
apis:
  - protocol: rpc
    path: "social.relationship.friendship.update"
    description:
      zh: >
          调用 social.relationship.friendship.update。
          
      en: >
          Calls social.relationship.friendship.update.
          
  - protocol: rpc
    path: "social.relationship.friendship.strength"
    description:
      zh: >
          调用 social.relationship.friendship.strength。
          
      en: >
          Calls social.relationship.friendship.strength.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
    label: {zh: "持久化友谊关系", en: "Persist friendship"}
---
