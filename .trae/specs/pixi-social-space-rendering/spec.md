# PixiJS 社会空间渲染层 Spec

覆盖 GitHub Issues #19、#20、#21。由于 AI 无法生成像素艺术资产，采用**程序化生成资产 + 完整 PixiJS 渲染层**替代方案，保持资产接口可被真实美术资源替换。

## Why

WebUI 重构 Phase 3 的 SocialView 当前用纯 SVG 渲染空间网格，缺乏空间沉浸感与角色动态。`docs/WEBUI-REFACTOR.md` §4.3.7 明确要求仿造 ai-town 用 PixiJS + Tiled tilemap 实现像素地图视图。但 #19（Tiled 地图）和 #20（角色精灵图）原计划依赖人工美术制作，会无限期阻塞 #21（PixiJS 渲染层）。

本 spec 用 Python 脚本程序化生成占位像素资产（保留可替换接口），完整实现 #21 PixiJS 渲染层，让三个 issue 全部可验收交付。

## What Changes

### #19 替代方案 — 程序化生成 Tiled 地图
- 新增 `tools/gen_tilemaps.py` Python 脚本（使用 Pillow）
- 为 5 个空间（town_square / cafe / home / station / night_market）生成：
  - `tileset.png` — 16×16 像素 tileset，包含地砖、墙壁、家具、装饰元素
  - `tilemap.json` — Tiled 1.9 兼容 JSON 格式，含 bgTiles / objectTiles / animatedSprites 三层
- 输出目录：`src/webui/public/assets/tilemaps/{space_id}/`
- 每个空间有独特调色板（广场=暖灰石板、咖啡馆=木色暖调、出租屋=冷淡水泥、车站=冷灰金属、夜市=深紫霓虹）
- 动画元素：广场喷泉、咖啡馆蒸汽、出租屋风扇、车站站台灯、夜市灯串（用 2-3 帧循环）

### #20 替代方案 — 程序化生成角色精灵图
- 新增 `tools/gen_spritesheets.py` Python 脚本
- 为 11 个角色（林逸 + 10 NPC）生成：
  - `linyi.png` + `linyi.json` — 林逸精灵图（蓝色调，作家气质）
  - 10 个 NPC 各一套：`npc_{id}.png` + `npc_{id}.json`
- 规格：4 方向（down/left/right/up）× 4 帧 = 16 帧，每帧 32×32 像素，spritesheet 总尺寸 128×128
- 按 archetype 颜色编码：stranger=灰、regular=绿、outsider=紫、authority=红
- 输出目录：`src/webui/public/assets/spritesheets/`
- JSON 格式仿 ai-town spritesheetData：frames + animations 索引

### #21 PixiJS 渲染层（完整实现）
- 安装 npm 依赖：`pixi.js@^8` + `pixi-viewport@^5`
- 新增 composables（`src/webui/src/composables/`）：
  - `usePixiApp.ts` — PIXI.Application 生命周期管理（创建/销毁/resize）
  - `usePixiViewport.ts` — pixi-viewport 拖拽/缩放/滚轮/减速
  - `useCharacterSprite.ts` — AnimatedSprite 4 方向动画管理
- 新增 components（`src/webui/src/components/social/`）：
  - `PixiCanvas.vue` — PIXI.Application 容器，挂载到 div ref
  - `TilemapLayer.vue` — 渲染 Tiled tilemap（bgTiles + objectTiles + animatedSprites）
  - `CharacterLayer.vue` — 渲染林逸 + 当前空间 NPC 精灵
  - `SpaceSelector.vue` — 5 空间 tab 切换器
  - `GazeOverlay.vue` — 凝视压力半透明叠加层（红=高、绿=低）
- 修改 `SocialView.vue`：保留现有右侧 NpcDetails 面板，将左侧 SVG 网格替换为 PixiCanvas + SpaceSelector
- 新增 store action：`fetchSocialMap(spaceId)` 加载 tilemap JSON
- 新增类型：`TilemapData` / `SpritesheetData` / `CharacterSpriteState`

### 后端（可选轻量改动）
- `web/app.py` 新增 `GET /api/social/spaces/{space_id}/map` — 返回 tilemap JSON + 当前空间 NPC 位置
- 或纯前端方案：直接 fetch `/assets/tilemaps/{space_id}/tilemap.json`（静态资源）

## Impact

- **Affected specs**: WEBUI-REFACTOR.md §4.3.7.2 (Tilemap) / §4.3.7.3 (Character Sprite) / §4.3.7.6 (空间切换) / §4.3.7.7 (凝视可视化) / §4.3.7.10 (技术选型方案 B)
- **Affected code**:
  - 新增：`tools/gen_tilemaps.py`、`tools/gen_spritesheets.py`
  - 新增：`src/webui/public/assets/tilemaps/` (5 个子目录，约 15 个文件)
  - 新增：`src/webui/public/assets/spritesheets/` (11 套，约 22 个文件)
  - 新增：`src/webui/src/composables/usePixiApp.ts` / `usePixiViewport.ts` / `useCharacterSprite.ts`
  - 新增：`src/webui/src/components/social/` (5 个 .vue 文件)
  - 修改：`src/webui/src/views/SocialView.vue` (替换 SVG 为 PixiCanvas)
  - 修改：`src/webui/src/stores/agent.ts` (新增 socialMap state + fetchSocialMap)
  - 修改：`src/webui/src/types.ts` (新增 TilemapData / SpritesheetData 类型)
  - 修改：`src/webui/package.json` (新增 pixi.js + pixi-viewport)
  - 可选修改：`src/novelist_brain/web/app.py` (新增 map 端点)
- **Breaking**: SocialView 左侧网格 SVG 移除（被 PixiCanvas 替代），但右侧 NpcDetails 面板与底部遭遇时间线保留
- **资产可替换性**: 所有资产通过 URL 引用，未来用真实美术 PNG 替换 `public/assets/` 下文件即可，无需改代码

## ADDED Requirements

### Requirement: 程序化生成 Tiled 兼容地图资产
系统 SHALL 提供 `tools/gen_tilemaps.py` 脚本，为 5 个空间生成 Pillow 绘制的 tileset.png + Tiled JSON tilemap.json，包含 bgTiles / objectTiles / animatedSprites 三层。

#### Scenario: 生成广场地图
- **WHEN** 运行 `python tools/gen_tilemaps.py`
- **THEN** 在 `src/webui/public/assets/tilemaps/town_square/` 生成 `tileset.png` (16×16 tiles, 至少 8 种 tile 类型) 和 `tilemap.json` (Tiled 1.9 格式, 32×24 tile 网格, 包含喷泉动画)
- **AND** JSON 包含 `layers[0].name == "bgTiles"`、`layers[1].name == "objectTiles"`、`layers[2].name == "animatedSprites"`

#### Scenario: 生成所有 5 个空间
- **WHEN** 脚本执行完成
- **THEN** 5 个空间目录均存在 tileset.png + tilemap.json
- **AND** 每个空间的 tilemap 尺寸与 WEBUI-REFACTOR.md §4.3.7.11 表格一致（home 16×12, cafe 20×15, town_square 32×24, station 24×16, night_market 28×20）

### Requirement: 程序化生成角色精灵图资产
系统 SHALL 提供 `tools/gen_spritesheets.py` 脚本，为林逸 + 10 NPC 生成 4 方向×4 帧的像素人形 spritesheet。

#### Scenario: 生成林逸精灵图
- **WHEN** 运行 `python tools/gen_spritesheets.py`
- **THEN** 在 `src/webui/public/assets/spritesheets/linyi.png` 生成 128×128 像素 spritesheet (4×4 网格, 每帧 32×32)
- **AND** 同目录 `linyi.json` 包含 `{ "frames": 16, "frameSize": {"w":32,"h":32}, "animations": {"down":[0,1,2,3],"left":[4,5,6,7],"right":[8,9,10,11],"up":[12,13,14,15]} }`

#### Scenario: 按 archetype 颜色编码
- **WHEN** 生成 NPC 精灵图
- **THEN** stranger archetype 用灰色调、regular 用绿色调、outsider 用紫色调、authority 用红色调
- **AND** 林逸用独特蓝色调（与所有 NPC 区分）

### Requirement: PixiJS 渲染层组件
系统 SHALL 提供 Vue 3 + pixi.js 组合式函数与组件，渲染 Tiled tilemap + 角色精灵 + 凝视叠加。

#### Scenario: 加载空间地图
- **WHEN** 用户切换到某空间 tab
- **THEN** PixiCanvas 挂载 PIXI.Application，TilemapLayer 加载该空间的 tilemap.json + tileset.png
- **AND** bgTiles 层铺满整个地图，objectTiles 层叠加家具/墙壁，animatedSprites 层播放动画（喷泉/蒸汽/风扇/灯串）

#### Scenario: 渲染角色精灵
- **WHEN** tilemap 加载完成
- **THEN** CharacterLayer 在林逸当前位置渲染 AnimatedSprite（朝向 down, 默认帧 0）
- **AND** 当前空间可见的 NPC 各渲染一个 AnimatedSprite
- **AND** 林逸精灵底部有金色高亮底座区分

#### Scenario: 拖拽缩放视口
- **WHEN** 用户在地图上拖拽
- **THEN** pixi-viewport 平移视口
- **WHEN** 用户滚轮
- **THEN** 视口以鼠标为中心缩放（最小 0.5x, 最大 3x）

#### Scenario: 凝视压力叠加
- **WHEN** 当前空间 gaze_intensity > 0.3
- **THEN** GazeOverlay 在地图上叠加半透明红色（rgba(255,0,0,0.15)）
- **WHEN** gaze_intensity < 0.15
- **THEN** GazeOverlay 叠加半透明绿色

#### Scenario: 点击 NPC 选中
- **WHEN** 用户点击某 NPC 精灵
- **THEN** 触发 `selectNpc(npcId)` 事件
- **AND** 右侧 NpcDetails 面板显示该 NPC 详情（复用现有 #22 实现）

### Requirement: SocialView 集成 PixiCanvas
系统 SHALL 将 SocialView 左侧 SVG 网格替换为 PixiCanvas + SpaceSelector 组合，保留右侧 NpcDetails 与底部遭遇时间线。

#### Scenario: 视图加载
- **WHEN** 进入 /social 路由
- **THEN** 顶部显示 SpaceSelector（5 个空间 tab）
- **AND** 中间显示当前空间的 PixiCanvas
- **AND** 右侧保留 NpcDetails drawer（NPC 未选中时收起）
- **AND** 底部保留遭遇时间线

## MODIFIED Requirements

### Requirement: SocialView 布局
[原 SVG 网格 + NPC 列表 + 遭遇时间线] 改为 [SpaceSelector + PixiCanvas + NpcDetails drawer + 遭遇时间线]。NpcDetails 触发方式从点击列表行改为点击 PixiCanvas 内 NPC 精灵。

## REMOVED Requirements

### Requirement: 原始 SVG 空间网格
**Reason**: 被 PixiCanvas 像素地图取代，提供更直观的空间沉浸感
**Migration**: SocialView.vue 中 `<div class="space-grid">` SVG 块删除，相关 spaceTone 函数保留用于 GazeOverlay 颜色映射
