---
uid: e40e122c
id: truman-town.social.procreation.offspring
parent: truman-town.social.procreation
name: {zh: "子代创建", en: "Offspring Creation"}
description:
  zh: >
      请求创建子代并调用遗传与提示词组装流程。
      
  en: >
      Requests offspring creation and invokes heredity and prompt assembly.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T07:57:42.689Z"
fingerprint: 354da6a5e2e887c8a7d8acf78bdcf14043fe4537517880fbba2650c3e60419bf
source:
  - path: "src/social/procreation/offspring.js"
apis:
  - protocol: rpc
    path: "social.procreation.offspring.request"
    description:
      zh: >
          调用 social.procreation.offspring.request。
          
      en: >
          Calls social.procreation.offspring.request.
          
  - protocol: rpc
    path: "social.procreation.offspring.compose"
    description:
      zh: >
          调用 social.procreation.offspring.compose。
          
      en: >
          Calls social.procreation.offspring.compose.
          
deps:
  - kind: call
    to: truman-town.agent.traits.inherit.sampler
    label: {zh: "组合父母标签", en: "Combine parent tags"}
  - kind: call
    to: truman-town.agent.traits.inherit.validator
    label: {zh: "校验子代标签", en: "Validate offspring tags"}
  - kind: call
    to: truman-town.agent.traits.tagset.store
    label: {zh: "读写标签集", en: "Read/write tagsets"}
  - kind: call
    to: truman-town.infra.identity
    label: {zh: "分配子代 ID", en: "Allocate offspring id"}
  - kind: call
    to: truman-town.social.family.inherit.applier
    label: {zh: "合并家族特质", en: "Merge family traits"}
---
