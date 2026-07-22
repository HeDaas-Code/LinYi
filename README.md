# LinYi — 小说家"林逸"人格主体智能体

> 以脑科学三网络模型 (SN/DMN/CEN) 为架构灵感的小说创作智能体。林逸是一位内倾、敏感、关注城市边缘人的小说家，系统模拟她的认知过程来生成具有文学性的长篇连载。

## 项目概况

| 维度 | 数据 |
|------|------|
| 语言 | Python 3.12+ / TypeScript (Vue 3) |
| 代码规模 | ~30,000 行 Python (45 模块) + ~6,000 行 TypeScript (24 组件) |
| 测试 | 498 tests, 全绿 (~12s) |
| LLM 后端 | MiniMax-M3 (OpenAI 兼容协议) |
| 架构文档 | [Design.md](Design.md) (4,300+ 行) |
| 重构方案 | [docs/系统重构方案_v1.md](docs/系统重构方案_v1.md) (1,530+ 行) |

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 18+ (仅 WebUI 开发需要)
- MiniMax / OpenAI 兼容 API Key

### 一键运行

```bash
# 1. 克隆仓库
git clone https://github.com/HeDaas-Code/LinYi.git
cd LinYi

# 2. 配置 API Key
cp novelist.config.example.json novelist.config.json
# 编辑 novelist.config.json 填入 API Key
# 或创建 API.info: {"key": "your-key-here"}

# 3. 运行 (自动创建 venv + 安装依赖)
./run.sh

# Mock 模式 (无需 LLM, 用于开发/测试)
./run_mock.sh
```

### 手动安装

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 运行测试
python3 -m pytest tests/ -q

# 启动 Agent
python main.py --llm-model "MiniMax-M3" --config novelist.config.json
```

### WebUI 开发

```bash
cd src/webui
npm install
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 生产构建 → ../novelist_brain/web/static/dist/
```

WebUI 开发服务器自动代理 `/api`、`/ws`、`/health`、`/static` 到后端 `http://127.0.0.1:8000`。

## 架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                         LinYi Agent 架构                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ SN 显著性   │  │ DMN 默认    │  │ CEN 中央    │                  │
│  │ 网络        │  │ 模式网络    │  │ 执行网络    │                  │
│  │             │  │             │  │             │                  │
│  │ 评估输入    │  │ 做梦/反思   │  │ 目标管理    │                  │
│  │ 切换 DMN/CEN│  │ 心理漫游    │  │ 计划生成    │                  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          │                                           │
│                    ┌─────┴─────┐                                     │
│                    │ BusRouter │  事件总线 pub/sub                   │
│                    └─────┬─────┘                                     │
│           ┌──────────────┼──────────────┐                           │
│           │              │              │                           │
│  ┌────────┴───┐  ┌───────┴────┐  ┌─────┴──────┐                     │
│  │ 记忆系统   │  │ 脑中世界   │  │ 社交输入   │                     │
│  │            │  │ 沙盒(TRPG) │  │            │                     │
│  │ 碎片→痕迹 │  │ A/B 推演   │  │ NPC 遭遇   │                     │
│  │ →巩固     │  │ COC 规则   │  │ 关系演化   │                     │
│  └────────────┘  └────────────┘  └────────────┘                     │
│                                                                      │
│  ┌────────────────────────────────────────────┐                      │
│  │            小说生成流水线 (v2)              │                      │
│  │                                            │                      │
│  │  Planner → COCMappingEngine → CEN          │                      │
│  │  → CreationExecutive → ChapterManager      │                      │
│  │  → ContinuityAuditor → QualityEngine       │                      │
│  └────────────────────────────────────────────┘                      │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Metabolism   │  │ EOS 观测台   │  │ Persistence  │              │
│  │ 代谢约束     │  │ 健康监控     │  │ 快照+增量    │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                      │
│  ┌────────────────────────────────────────────┐                      │
│  │           WebUI (Vue 3 + PixiJS)            │                      │
│  │                                            │                      │
│  │  11 视图: 人格/日记/网络/日程/记忆/        │                      │
│  │  社会空间/脑中世界/小说手稿/EOS/总线/配置  │                      │
│  └────────────────────────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────────┘
```

## 核心模块

### 神经网络层

| 模块 | 文件 | 职责 |
|------|------|------|
| SN (Salience Network) | `salience_network.py` | 评估输入碎片显著性，切换 DMN/CEN |
| DMN (Default Mode Network) | `dmn.py` | 做梦、反思、心理漫游，巩固记忆 |
| CEN (Central Executive Network) | `cen.py` | 目标管理、计划生成、小说推演 |

### 认知系统

| 模块 | 文件 | 职责 |
|------|------|------|
| Memory | `memory.py` | 碎片→痕迹→巩固三层记忆，容量上限+遗忘机制 |
| MentalSandbox | `sandbox.py` | TRPG 驱动的 what-if 推演，A/B 版本管理 |
| SocialInput | `social_input.py` | NPC 遭遇、关系演化、社交能量 |
| Identity | `identity.py` | 林逸人格画像 (Big Five traits + values) |
| Metabolism | `metabolism.py` | 能量/注意力预算，约束认知活动 |

### 小说生成流水线 (v2 重构)

| 模块 | 文件 | 职责 |
|------|------|------|
| Planner | `planner.py` | 故事圣经驱动的章节规划，滚动 3-5 章 |
| COCMappingEngine | `coc_mapping_engine.py` | 章节意图→COC 规则场景映射 |
| CreationExecutive | `creation_executive.py` | Hook/爽点/伏笔回收的段落生成 |
| ChapterManager | `chapter_manager.py` | 卷/章/版本管理，回溯与定稿 |
| ContinuityAuditor | `continuity_auditor.py` | 六维连续性审计 (OOC/设定/时间线/伏笔/语气/节奏) |
| QualityEngine | `quality_engine.py` | 去 AI 味规则，文风一致性检测 |
| WorldState | `world_state.py` | 动态世界状态契约，替代硬编码 default world |
| OCCharacterSystem | `oc_character_system.py` | 原创角色卡系统，projection_ratio 区分真人/OC |
| WorldVisualDebugger | `world_visual_debugger.py` | 世界状态可视化调试 |

### 基础设施

| 模块 | 文件 | 职责 |
|------|------|------|
| BusRouter | `bus.py` | 线程安全 pub/sub 事件总线 (RLock) |
| PersistenceManager | `persistence.py` | 快照+增量持久化，原子写入，retention |
| LLMService | `llm.py` | OpenAI 兼容 LLM 调用，三层容错 (重试→熔断→Mock) |
| EOS | `eos.py` | 运行时观测台，资源/LLM/OOC 告警 |
| Config | `config.py` | 分层配置 (default → file → CLI) |

## WebUI 仪表盘

### 视图列表

| 视图 | 路由 | 说明 |
|------|------|------|
| 人格画像 | `/identity` | 林逸 Big Five 雷达图、价值观、声音签名 |
| 日记·反思 | `/dream` | DMN 做梦/反思记录 |
| 网络状态 | `/networks` | SN/DMN/CEN 三网络状态 + 代谢能量 |
| 日程节律 | `/schedule` | 24h 认知节律时间线 |
| 记忆图谱 | `/memory` | 碎片/痕迹浏览，标签聚类 |
| 社会空间 | `/social` | PixiJS 像素地图 (5 空间) + NPC 精灵 + 遭遇历史 |
| 脑中世界 | `/sandbox` | TRPG 沙盒推演 A/B 版本 |
| 小说手稿 | `/novel` | 章节化小说输出 |
| EOS 观测台 | `/eos` | 运行时健康指标 |
| 总线事件 | `/bus` | 实时总线消息流 |
| 配置管理 | `/config` | 运行时配置查看/修改 |

### 技术栈

- **Vue 3** + Composition API (`<script setup>`)
- **Vite 5** 构建，hash 路由
- **Pinia** 状态管理
- **PixiJS v8** + pixi-viewport 像素地图渲染
- **D3.js v7** 数据可视化
- **Chart.js v4** 图表
- **WebSocket** 实时推送 (轮询 fallback)

### 程序化资产生成

因无法手工制作像素美术，使用 Python 脚本生成占位资产，保留接口可被真实美术替换：

- `tools/gen_tilemaps.py` — 5 个社会空间的 Tiled 1.9 兼容 tilemap (960 行)
- `tools/gen_spritesheets.py` — 林逸 + 10 NPC 的 4 方向×4 帧精灵图 (218 行)

## 测试

```bash
# 全量测试
python3 -m pytest tests/ -q

# 按模块运行
python3 -m pytest tests/test_continuity_auditor.py -v

# E2E 集成测试
python3 -m pytest tests/test_e2e_integration.py -v

# 性能基准
python3 -m pytest tests/test_performance_benchmark.py -v
```

### 测试覆盖

| 测试文件 | 测试数 | 覆盖范围 |
|---------|--------|---------|
| `test_e2e_integration.py` | 16 | Story Bible→COC→段落→审计全链路 |
| `test_scenario_driven_simulation.py` | 20 | 场景驱动推演 |
| `test_chapter_manager.py` | 24 | 章节版本管理+回溯 |
| `test_continuity_auditor.py` | 31 | 六维连续性审计 |
| `test_quality_engine.py` | 30 | 去 AI 味+文风一致性 |
| `test_world_state_contract.py` | 26 | 世界状态契约 |
| `test_oc_character_system.py` | 26 | OC 角色系统 |
| `test_coc_mapping_engine.py` | 24 | COC 规则映射 |
| `test_migration_v1_to_v2.py` | 23 | v1→v2 状态迁移 |
| `test_planner.py` | 23 | 章节规划器 |
| `test_world_visual_debugger.py` | 22 | 世界可视化调试 |
| `test_web_debug_api.py` | 21 | WebUI Debug API |
| `test_performance_benchmark.py` | — | 性能基准 |
| `test_acceptance_3chapters.py` | — | 3 章验收测试 |

## 配置

### 配置文件

```json
// novelist.config.json
{
  "version": "2.1.0",
  "llm": {
    "model": "MiniMax-M3",
    "api_key": "your-key",
    "base_url": "https://api.minimaxi.com/v1"
  },
  "persistence": {
    "retention": { "max_snapshots": 20, "max_age_hours": 168 }
  }
}
```

参见 `novelist.config.example.json` 和 `default.config.json` 获取完整配置项。

### CLI 参数

```bash
python main.py \
  --llm-model "MiniMax-M3" \
  --config novelist.config.json \
  --llm-api-key "your-key" \
  --llm-base-url "https://api.minimaxi.com/v1"
```

## 项目结构

```
LinYi/
├── main.py                         # Agent 入口
├── Design.md                       # 架构设计文档 (4,300+ 行)
├── requirements.txt                # Python 依赖
├── run.sh / run_mock.sh            # 一键运行脚本
├── default.config.json             # 默认配置
├── novelist.config.example.json    # 配置模板
│
├── src/
│   ├── novelist_brain/             # 后端 Python 模块 (45 文件)
│   │   ├── bus.py                  # 线程安全事件总线
│   │   ├── models.py               # 数据模型 (dataclass)
│   │   ├── memory.py               # 三层记忆系统
│   │   ├── sandbox.py              # TRPG 脑中世界沙盒
│   │   ├── llm.py                  # LLM 服务层
│   │   ├── persistence.py          # 持久化管理
│   │   ├── planner.py              # 小说规划器
│   │   ├── chapter_manager.py      # 章节管理
│   │   ├── continuity_auditor.py   # 连续性审计
│   │   ├── quality_engine.py       # 质量引擎
│   │   ├── world_state.py          # 动态世界状态
│   │   ├── coc_mapping_engine.py   # COC 规则映射
│   │   ├── oc_character_system.py  # OC 角色系统
│   │   └── web/                    # FastAPI Web 服务
│   │       ├── app.py              # REST API (26+ 端点)
│   │       ├── bus_spy.py          # 总线消息录制
│   │       └── websocket.py        # WebSocket 推送
│   │
│   └── webui/                      # Vue 3 前端项目
│       ├── src/
│       │   ├── views/              # 12 个视图组件
│       │   ├── components/         # 10 个共享组件
│       │   │   └── social/         # PixiJS 社会空间组件
│       │   ├── composables/        # 5 个组合式函数
│       │   ├── stores/             # Pinia store
│       │   └── types.ts            # 类型定义 (575 行)
│       ├── tools/
│       │   ├── gen_tilemaps.py     # 程序化生成 tilemap
│       │   ├── gen_spritesheets.py # 程序化生成精灵图
│       │   └── migrate_state_v1_to_v2.py  # 状态迁移工具
│       └── vite.config.ts
│
├── tests/                          # 498 个测试
│
└── docs/                           # 文档
    ├── AUDIT-REPORT.md             # 独立审计报告
    ├── WEBUI-REFACTOR.md           # WebUI 重构方案
    ├── 系统重构方案_v1.md           # v2 系统重构方案
    └── refs/                       # 7 个参考项目 + 架构对照
```

## 文档体系

| 文档 | 内容 | 读者 |
|------|------|------|
| [README.md](README.md) | 项目总览、快速开始、项目结构 | 新人入门 |
| [Design.md](Design.md) | 完整架构设计 (22 章, 4,300+ 行) | 架构设计者 |
| [docs/系统重构方案_v1.md](docs/系统重构方案_v1.md) | v2 重构方案 (故事圣经/动态世界/OC/COC) | 重构参与者 |
| [docs/WEBUI-REFACTOR.md](docs/WEBUI-REFACTOR.md) | WebUI 11 视图重构方案 | 前端开发者 |
| [docs/AUDIT-REPORT.md](docs/AUDIT-REPORT.md) | 独立审计报告 (issue #2~#10) | 质量审计 |
| [docs/refs/](docs/refs/) | 7 个参考项目架构对照与借鉴矩阵 | 研究者 |
| [.trae/specs/](.trae/specs/) | Trae 开发 spec 文档 (需求/任务/检查清单) | 开发者 |

## 参考项目

本项目参考了 7 个开源小说生成项目，架构对照详见 [docs/refs/architecture_compare.md](docs/refs/architecture_compare.md)：

| 项目 | 语言 | 借鉴点 |
|------|------|--------|
| ainovel-cli | Go | 引擎架构、审计工程化 |
| InkOS | TypeScript | 状态真源、多 Agent 流水线 |
| NovelPilot | TypeScript | 故事圣经、连续性侦探 |
| Webnovel Writer | Python | 网文节奏、Story System |
| AI Novel Factory | TypeScript | Director/Worker 协作 |
| NovelDreamer | Python | 显式叙事结构 |
| AI_NovelGenerator_YILING | Python | 雪花写作法 |

## 开发指南

### 分支命名

- `feature/v2-<模块>` — 新功能
- `fix/audit-<模块>` — bug 修复
- `trae/agent-<id>` — Trae AI 协作分支

### Commit 规范

```
feat(webui): #19/#20/#21 PixiJS 社会空间渲染层
fix(bus): #2 BusRouter 线程安全
docs: 独立审计报告 + WebUI 重构方案
chore: 新增 requirements.txt
```

### 运行环境

- **OS**: Linux (Debian 13 测试通过)
- **Python**: 3.12+
- **Node.js**: 18+ (WebUI 开发)
- **GPU**: 不需要
- **内存**: 4GB+ 推荐

## License

私有项目，未公开发布。
