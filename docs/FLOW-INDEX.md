# 数据流转索引 / Data-Flow Index

## 它解决什么问题

沙盘里 112 个模块级可变状态、43 个图节点类型、11 个 worldState 键互相读写。
排查一个非预期数据时，「这个值是谁写的、谁在读、在 tick 的哪一刻被改」无法靠读代码一眼看出，
于是出现三类反复踩到的坑：

1. **写了没人读的装饰性机制** —— 隔离名单被主循环每 tick 写入 9552 次，却没有任何消费方；
   机制「存在」但不产生任何行为后果。
2. **有状态但未纳入 reset 的跨 run 泄漏** —— `loop.reset()` 只覆盖了十余个模块，
   而全项目有 103 个模块导出 `__reset`；残留使同一份代码的结果取决于此前跑过什么。
3. **契约重复定义** —— `town.building.structure` 这一图类型在 `agent/crafting/construction.js`
   与 `town/building/structure.js` 各声明一次，改一处极易漏另一处。

## 怎么用

```bash
# 1) 从源码重新生成索引（代码改动后必跑）
node bin/flow-index.mjs

# 2) 查「某状态谁写谁读、是否纳入复位」+「相关阶段/状态机」
node bin/flow-index.mjs --query foragePool
node bin/flow-index.mjs --query 隔离
node bin/flow-index.mjs --query business

# 3) 生成可在图上逐层下钻的 Normify 结构树（依赖上一步的 flow-index.json）
node bin/flow-to-normify.mjs
#    产物：normify-truman-town-flow/normify.html（浏览器打开，支持双语/深链/悬停下钻）
```

## 索引内容

| 层 | 内容 | 回答什么问题 |
|---|---|---|
| 状态单元 | 153 个模块级可变状态 | 这个值是谁写的？谁读的？跨 run 会不会残留？ |
| 主循环阶段 | 12 个 tick 内阶段（含顺序与读写目标） | 它在 tick 的哪一刻被改？ |
| 图节点类型 | 43 种图节点 + 生产/消费方 | 这个关系数据是谁产出的？有没有人消费？ |
| 状态机 | 6 个关键状态机（生命/疾病/隔离/企业/文明/日程） | 它现在处于哪个状态？怎么迁移过去的？ |
| 诊断 | 静态发现的可疑项（分级） | 有没有已标注的坑？ |

## 诊断分级

- `store/never-read`（error）：被写入但无任何函数读取——状态不产生行为后果。
- `store/no-reset-function`（error）：文件无复位函数且变量被写入——状态无法复位。
- `store/reset-missing`（warning）：文件有复位函数但未覆盖该变量——跨 run 残留风险。
- `graph/duplicate-declaration`（warning）：同一图类型被多处各自声明——契约重复。
- `store/dead`（warning）：无任何函数读写。

## 为什么索引本身不会腐烂

索引是**派生数据**（从源码静态提取），源码一变就可能过期。因此：

- 索引不允许手写，只能由 `bin/flow-index.mjs` 生成；
- `test/flow-index.test.js` 会重新生成并与仓库内文件比对，不一致即失败（防止有人改了代码没重建索引）；
- 测试同时锁定 error 级诊断数量上限与孤立图类型数量上限，**退化会立即失败**。

## 与 truman-town 结构树的分工

- `normify-truman-town`：描述**代码该长什么样**（契约、分层、依赖方向）。
- `normify-truman-town-flow`：描述**数据实际怎么流**（事实、读写方、时机、状态）。

两者刻意分开：契约与事实会独立演进，混在一棵树里会互相污染。
排查异常时以 flow 树为主、truman-town 树为辅。
