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
#    产物：normify-truman-town-flow/normify.html。渲染产物不进主分支——
#    在线查看走 normify 归档分支（见文末「架构与数据流图谱」）。
```


## 连线模型：四层三跳

数据流转图上**必须有连线**——只有清单没有箭头，下钻时看不出流向。
第一版做成零边（读写关系塞进了 API 列表），第二版又建错了语义
（把「读者」画成状态到状态的边，导致 `foragePool` 的 7 个读者被误归到另一个状态变量）。

正确模型是**四层三跳**：

```
写者代码模块  --(写)-->  状态单元  --(读)-->  读者代码模块
```

- **代码模块**层：每个持有模块级状态的文件一个节点，按源码目录组织。
  它是流转的端点——「谁在写」和「谁在读」都是**文件**，不是别的状态变量。
- **状态单元**层：被读写的那个值。
- 状态单元之间**没有**直接连线，一律经代码模块中转；
  否则无法区分「同文件自读」与「跨文件依赖」。
- 每条边都用 `from_api`/`to_api` 锚定到**具体的写/读函数名**，
  箭头才会钉在框内的那一行，而不是浮在框边。

实测规模（当前代码）：323 模块 / 504 条 dataflow 边，
其中写边 225、读边 279，**跨文件流转 168 条**——这 168 条才是真正有价值的依赖。

## 数据流转图天然有环，不能用 core-acyclic

`A` 写状态 X、`B` 读 X；`B` 又写状态 Y、`A` 读 Y —— 这就是一个环，
但它描述的正是「两个模块互相影响」这一事实，不是设计缺陷。
`truman-town` 树描述**调用依赖**，环是 defect；本树描述**数据流转**，环是常态。
因此本树安装了一份去掉 acyclic 的规则集（`policy.yml`，见 normify 归档分支的
`normify-truman-town-flow/`），
只保留「不依赖 deprecated 模块」这一条。

## 排查一个异常值的完整路径

1. 在 `truman-town-flow.code` 下找到持有该值的文件，看**出边**（它写什么）。
2. 在 `truman-town-flow.state` 下找到该状态单元，看**入边/出边**：
   谁写它、谁读它，每条边都标到了具体函数名。
3. 切到 `truman-town-flow.phases` 确认它在 tick 的哪一刻被改。
4. 若是生命/疾病/隔离/企业/文明/日程这类阶段性状态，看 `truman-town-flow.machines`。
5. 最后核对 `truman-town-flow.diagnostics` 是否已标注该可疑项。
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

## 架构与数据流图谱（normify 归档分支）

交互式渲染副本归档在 [`normify` 孤儿分支](https://github.com/HeDaas-Code/LinYi/tree/normify)；`flow-index.json` 与生成器属于**代码**留在主分支：

- [`normify-truman-town`](https://github.com/HeDaas-Code/LinYi/blob/normify/normify-truman-town/outline.md)：描述**代码该长什么样**（契约、分层、依赖方向）。[在线交互图谱](https://htmlpreview.github.io/?https://github.com/HeDaas-Code/LinYi/blob/normify/normify-truman-town/normify.html)。渲染产物（2.9 MB）只在归档分支，主分支不留。
- [`normify-truman-town-flow`](https://github.com/HeDaas-Code/LinYi/blob/normify/normify-truman-town-flow/outline.md)：描述**数据实际怎么流**（事实、读写方、时机、状态）。[在线交互图谱](https://htmlpreview.github.io/?https://github.com/HeDaas-Code/LinYi/blob/normify/normify-truman-town-flow/normify.html)。该目录在**主分支保留一份冻结基准**：`test/flow-index.test.js` 用它做防腐烂比对，而生成器依赖平台私有工具链（`@dsh-external/dsh-normify`，npm 上不可得），冻结产物即证据——重生成时须与守卫测试同批提交。

两者刻意分开：契约与事实会独立演进，混在一棵树里会互相污染。
排查异常时以 flow 树为主、truman-town 树为辅。