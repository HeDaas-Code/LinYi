# Normify 产物归档

本分支是 [HeDaas-Code/LinYi](https://github.com/HeDaas-Code/LinYi)（楚门小镇沙盘）的**生成产物归档分支**，只存放两套 Normify 编译出的图谱，不含任何代码：

| 目录 | 内容 |
| --- | --- |
| [`normify-truman-town/`](normify-truman-town/) | **架构图谱**：148 个模块契约（105 叶子、225 API、110 依赖、43 布局），覆盖 runtime/agent/social/economy/town/genesis/ai/api/infra/survival/observer/civilization 十二域。渲染产物仅存本分支，主分支不留 |
| [`normify-truman-town-flow/`](normify-truman-town-flow/) | **数据流图谱**：由仓库内 `bin/flow-to-normify.mjs` 从 `flow-index.json`（153 个状态单元、43 种图节点类型）生成的读写流向图谱。主分支保留同一份冻结基准（`test/flow-index.test.js` 的比对对象），本分支供在线交互浏览 |

## 在线查看

- **[打开架构图谱](https://htmlpreview.github.io/?https://github.com/HeDaas-Code/LinYi/blob/normify/normify-truman-town/normify.html)** — 单文件 `normify.html`，点击模块逐层下钻，`#module=<id>` 深链直达。
- **[打开数据流图谱](https://htmlpreview.github.io/?https://github.com/HeDaas-Code/LinYi/blob/normify/normify-truman-town-flow/normify.html)** — 同样交互式，聚焦"这个值谁写、谁读、在 tick 哪一刻被改"。
- 逐层通读：[`normify-truman-town/outline.md`](normify-truman-town/outline.md)、[`normify-truman-town-flow/outline.md`](normify-truman-town-flow/outline.md)
- 机器可读：各目录下的 [`api-index.json`](normify-truman-town/api-index.json)、[`tree.json`](normify-truman-town/tree.json)、[`receipt.json`](normify-truman-town/receipt.json)（SHA-256 指纹与编译元数据）

## 溯源

架构图谱由外部 Normify 工具从仓库源码生成，叶子模块带仓库内真实文件路径与 SHA-256 指纹，`normify_validate` 结果 0 error；数据流图谱由 `node bin/flow-to-normify.mjs` 再生成（索引本身由 `bin/flow-index.mjs` 静态提取，受 `test/flow-index.test.js` 守卫——改了代码不重建索引会直接红）。本分支冻结于主仓库 commit `c499481`；产物内容以两份 `receipt.json` 为准。

## 维护约定

- 主仓库的日常提交不触碰本分支；只在重新编译图谱时更新（重编译后同步刷新主仓库 README 里的冻结 commit 号）。
- 主仓库 README 的「架构与数据流图谱」一节索引本分支；改索引请去主仓库。
- `flow-index.json` 与 `bin/flow-index.mjs` 属于**代码**，留在主分支并受测试守卫；归档的只是渲染产物。
