# NovelDreamer 技术笔记

## 项目概述

- **主语言 / 技术栈**：Python 3，依赖仅 `langchain-core==0.2.29`、`langchain-openai==0.1.21`、`wikiquote==0.1.17` 三个包（见 `/workspace/docs/refs/NovelDreamer/requirements.txt`）。可选 `streamlit` 作为 GUI 前端。
- **定位**：研究型长篇故事生成原型（Research Prototype），论文 *NovelDreamer: Harnessing LLMs for Coherent and Engaging Long-Form Storytelling* 的官方代码实现。
- **核心目标**：通过 RAG（Wikiquote 名著语录）+ 显式叙事结构（Hero's Journey / Freytag / Three-Act / Story Circle / Fichtean Curve / Save the Cat / Seven-Point）增强 LLM 在长篇上的连贯性、吸引力与风格一致性。
- **仓库结构**：极简的单文件实现——整个项目核心逻辑都集中在 `/workspace/docs/refs/NovelDreamer/story_generator.py`（812 行），加上 `README.md`、配套论文 PDF、`requirements.txt` 与一张 header 图。没有任何测试、没有模块拆分、没有配置文件。

## 核心创新点

1. **七选一显式故事结构选择器**（`story_generator.py:22-191`，`story_structure_chooser` 提示词）。该提示词把 7 种结构（Classic / Freytag's Pyramid / Hero's Journey / Three Act Structure / Dan Harmon's Story Circle / Fichtean Curve / Save the Cat Beat Sheet / Seven-Point Story Structure）的"Sections"与"When to Use"全部内嵌进 prompt handbook，让 LLM 自行对照 `story_prompt` 推理选用哪一种结构，并要求"reference similar popular works and how they aided your decision"。这是该项目最可被 LinYi Planner 直接借用的资产。
2. **每章三幕（Act 1/2/3）结构化生成**（`story_generator.py:328-381`，`act_generator_prompt`；`:383-403`，`acts_json`；`:492-506`，`Acts` Pydantic model）。每章不是一次性写完，而是先由 LLM 拆成三幕并各自给出 `description` + `writingAdvice`，再用 `JsonOutputParser` 强制结构化为 JSON。每幕单独调用一次 LLM 完成正文。
3. **Wikiquote 风格迁移**（`story_generator.py:577-599`，`get_quotes_for_work`；`:465-481`，`popular_works_prompt`；`:647-650`，`format_quotes`）。流程：先用 `popular_works_prompt` 让 LLM 从结构选择器的输出中抽取"similar popular works"列表（Pydantic `PopularWorks`），再对每个作品调用 `wikiquote.search()` + `wikiquote.quotes(max_quotes=10)` 拉取语录，最后拼成 `famous_work_reference` 注入 `write_act_prompt` 作为风格参考。
4. **滚动式章节摘要作为跨章上下文**（`story_generator.py:699`，`chapter_summaries = []`；`:730`，`summarize(story[chapter_title])`；`:759-760`，每章结束后 append）。下一章生成时把 `previous_chapter_summaries` 通过 `'\n\n'.join` 注入 prompt（`:614`），实现一个低成本的"滚动剧情记忆"。
5. **Act 级无缝拼接策略**（`story_generator.py:455-463`，`write_act_extra`）。从第 2 幕起，额外注入 `previous_acts` 摘要与"ending lines of what happened previously. pick up where it is left up with no pre text"，并明确要求"nowhere in the text mention that we are on act {act_number} just output the story text"，让三幕拼成连续正文而不出现分幕标题。

## 可直接复用的设计

- **`story_structure_chooser` 提示词手册**（`story_generator.py:22-191`）：7 种结构的中英对照手册可直接抽离为一个常量文件，作为 LinYi `Planner` 选择节拍曲线（beat curve）时的依据。建议做法：把该字符串拆成 `STRUCTURES = {name: {sections: [...], when_to_use: "...}}`，让 Planner 既可让 LLM 选，也可让用户/IdentityCore 显式指定。
- **`blueprint_prompt`**（`story_generator.py:199-290`）：模块化蓝图生成模板，按 Synopsis → Theme → Setting → World-Building → Characters → Timeline → Title → Chapter Breakdown → Writing Advice 顺序展开，可作为 LinYi Story Bible 的初始填充模板。LinYi 可裁掉其中的"Writing Advice"段（与 PlanCompass 重叠），保留前 7 段。
- **章节级三幕拆分模板**（`act_generator_prompt` + `Acts` Pydantic model，`:328-381, 499-506`）：LinYi 可将"每章三幕"降级为"每章三个 Strand 节拍"，与 Strand Weave 节奏对照使用。
- **滚动 `chapter_summaries`**（`:699, 759-760`）：简单的 list 滚动即可作为 LinYi ContinuityAuditor 的"剧情线记忆"输入，无需复杂结构。
- **Pydantic + JsonOutputParser 的结构化输出模式**（`:492-537`）：`Chapter/Chapters/Act/Acts/PopularWorks` 五个 model 全部走 `JsonOutputParser`，可被 LinYi 任何需要 LLM 返回结构化数据的场景借鉴。

## 需要改造才能借鉴的部分

- **Wikiquote 风格迁移需替换为中文语料**：Wikiquote 仅覆盖英文经典作品，对中文长篇作用有限。LinYi 应替换为中文诗词库、网文风格样本库或林逸已读作品的片段库；底层 `get_quotes_for_work(name)` 的接口签名可保留，但 retrieval 后端要换。
- **结构选择器是显式 LLM 调用**（`:514-517`，`get_story_structure`）：与 §14.3.6 警告一致，会显著增加 token 成本。建议仅在小说初始化时调用一次，把结果缓存在 Story Bible 中，避免每次生成章节都重选。
- **Streamlit UI 与全局变量耦合**（`USE_STREAMLIT`、`log_area`、`log_data`、`story = {}`，散落在 `:15, 634, 643, 660, 800-806`）：UI 层与生成逻辑混杂，LinYi 借鉴时必须先剥离 UI 层，只保留 `generate_story()`、`get_story_structure()` 等纯函数。
- **章节循环无断点恢复**（`:701-760` 主循环）：所有章节一次性跑完才退出，没有 checkpoint。LinYi 必须改为持久化每章状态（参考 YILING 的 `partial_architecture.json` 模式）。
- **Act 级粒度与 LinYi 章级粒度不匹配**：LinYi 更关注章级粒度（PlanCompass / Strand Weave），需把 NovelDreamer 的 Act 粒度映射为 Strand 节拍，而非直接复用为 Act 1/2/3。
- **`summarize_story_structure` 二次调用冗余**（`:193-197, 519-522`）：先让 LLM 选结构，再让 LLM 总结一遍结构分析，多花一次调用。LinYi 可直接让第一次调用返回结构化 JSON，省去第二次。

## 潜在风险

1. **语言差异**：项目整体面向英文长篇，提示词、handbook、`popular_works_prompt` 示例全部是英文。直接套用到中文长篇需要完整本地化。
2. **复杂度低但耦合度高**：812 行单文件，prompt 字符串、Pydantic model、`generate_story()` 主流程、Streamlit UI 全部混在 `story_generator.py` 中，难以单独复用某个模块——必须先做拆分。
3. **维护性差**：无测试、无错误恢复、`get_quotes_for_work` 有简单 try/except 但其他 LLM 调用基本裸跑。`log()` 函数还使用 `global log_data` 字符串拼接，对长篇生成来说日志体积会爆炸。
4. **性能成本**：每章约 9 次 LLM 调用（act 生成 1 + act JSON 转换 1 + 三幕写作 3 + 章摘要 1 + 可能的 act 摘要 3），长篇生成总成本不可忽视。

## 架构对照信息（供 architecture_compare.md 使用）

- **模块拆分方式**：无模块拆分，全部 prompt + 函数 + UI 写在单文件 `story_generator.py`。
- **事件/数据流**：用户 prompt → `get_story_structure` → `get_story_structure_summerize` → `get_popular_works_json` → `get_quotes_for_work`（每个作品）→ `get_story_blue_print` → `get_chapter_json` → 章循环（`generate_acts` → `convert_acts_to_json` → 三幕 `write_act` → `summarize`），纯线性无分支。
- **状态管理**：全局变量 `log_data`、`log_area`、`USE_STREAMLIT`、`story = {}` dict 临时存章节文本，`chapter_summaries = []` 滚动列表。无持久化。
- **提示词组织**：模块级字符串常量（`story_structure_chooser` / `summarize_story_structure` / `blueprint_prompt` / `chapter_json_prompt` / `act_generator_prompt` / `acts_json` / `write_act_prompt` / `write_act_extra` / `popular_works_prompt` / `summarize_story_part`），无格式化抽象，全部走 `str.format(**kwargs)`。
- **错误处理**：`get_quotes_for_work` 有 `try/except Exception` 并打印错误返回 None；其他 LLM 调用无重试、无超时控制、无回退。
- **性能优化**：无并发，所有 LLM 调用串行；无缓存；无 token 预算控制。
- **扩展机制**：添加新结构需手工编辑 `story_structure_chooser` 字符串内嵌的 handbook；添加新 LLM 后端需替换 `model = ChatOpenAI(...)` 全局变量；无插件/钩子机制。

## 借鉴点映射（供 borrow_matrix.md 使用）

参考 §14.4 借鉴矩阵：

| §14.4 借鉴点 | 覆盖情况 | 来源位置 |
|---|---|---|
| 显式叙事结构 | ✅ 完整覆盖 7 种结构 | `story_generator.py:22-191` |
| 风格迁移（外部语料） | ✅ 完整覆盖（但需替换为中文语料） | `story_generator.py:577-599, 465-481` |
| 滚动规划 | △ 部分覆盖（仅 `chapter_summaries` 滚动摘要，无分块续传） | `story_generator.py:699, 759-760` |
| 去 AI 味规则 | △ 部分覆盖（`write_act_prompt` 中 "Show Don't Tell" / "Dynamic Dialogue" / "Pacing" 等写作 tips） | `story_generator.py:427-433` |
| Story Bible 真源 | ❌ 无持久化真源 | — |
| Strand Weave 节奏 | ❌ 无 | — |
| ContinuityAuditor 六维 | ❌ 无 | — |
| 雪花写作法提示词 | ❌ 无 | — |
| 单一真源 | ❌ 无 | — |
| 多 Agent 流水线 | ❌ 无 | — |
| 文风指纹 | ❌ 无 | — |
| 题材模板 | ❌ 无（仅 prompt 中提 genre） | — |
| Foreshadowing Tracker | ❌ 无 | — |
| Director/Worker 协作 | ❌ 无 | — |

**LinYi 最应优先借鉴的两项**：(1) 7 种结构 handbook 与显式选择器；(2) 滚动 `chapter_summaries` 作为低成本跨章上下文。
