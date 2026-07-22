# PixiJS 社会空间渲染层 — 验收检查清单

## #19 程序化生成 Tiled 地图

- [ ] `tools/gen_tilemaps.py` 脚本存在并可独立运行（`python tools/gen_tilemaps.py` 无错误）
- [ ] `src/webui/public/assets/tilemaps/town_square/` 目录存在 `tileset.png` + `tilemap.json`
- [ ] `src/webui/public/assets/tilemaps/cafe/` 目录存在 `tileset.png` + `tilemap.json`
- [ ] `src/webui/public/assets/tilemaps/home/` 目录存在 `tileset.png` + `tilemap.json`
- [ ] `src/webui/public/assets/tilemaps/station/` 目录存在 `tileset.png` + `tilemap.json`
- [ ] `src/webui/public/assets/tilemaps/night_market/` 目录存在 `tileset.png` + `tilemap.json`
- [ ] 每个 `tilemap.json` 顶层有 `layers` 数组，且包含名为 `bgTiles` / `objectTiles` / `animatedSprites` 的三层
- [ ] town_square tilemap 尺寸为 32×24 tiles
- [ ] cafe tilemap 尺寸为 20×15 tiles
- [ ] home tilemap 尺寸为 16×12 tiles
- [ ] station tilemap 尺寸为 24×16 tiles
- [ ] night_market tilemap 尺寸为 28×20 tiles
- [ ] 至少一个空间的 animatedSprites 层包含 2 帧动画 tile
- [ ] 每个 tileset.png 至少包含 8 种不同 tile 类型（16×16 像素 tile）

## #20 程序化生成角色精灵图

- [ ] `tools/gen_spritesheets.py` 脚本存在并可独立运行
- [ ] `src/webui/public/assets/spritesheets/linyi.png` + `linyi.json` 存在
- [ ] `linyi.png` 尺寸为 128×128 像素（4×4 网格，每帧 32×32）
- [ ] `linyi.json` 包含 `frames: 16`、`frameSize: {w:32, h:32}`、`animations` 字段含 down/left/right/up 四个键
- [ ] 10 个 NPC 各有 `{npc_id}.png` + `{npc_id}.json`（npc_old_paper_vendor / npc_guitar_busker / npc_cafe_owner / npc_cafe_regular / npc_upstairs_neighbor / npc_landlord / npc_security_guard / npc_wanderer / npc_night_vendor / npc_night_youth）
- [ ] 林逸精灵主色调为蓝色（与 NPC 区分）
- [ ] stranger archetype NPC（卖报老人/楼上邻居/夜游年轻人）使用灰色调
- [ ] regular archetype NPC（咖啡馆老板/咖啡馆常客/夜市摊主）使用绿色调
- [ ] outsider archetype NPC（广场吉他手/流浪者）使用紫色调
- [ ] authority archetype NPC（房东/车站安检员）使用红色调

## #21 PixiJS 渲染层

### 依赖与配置
- [ ] `src/webui/package.json` 包含 `pixi.js` 和 `pixi-viewport` 依赖
- [ ] `src/webui/src/env.d.ts` 声明 `*.png` 和 `*.json` 模块（或 Vite 默认支持）
- [ ] `npm run build` 编译通过，无 TypeScript 错误

### 类型与 Store
- [ ] `src/webui/src/types.ts` 包含 `TilemapData` / `TileLayer` / `SpritesheetData` / `CharacterSpriteState` 类型
- [ ] `src/webui/src/stores/agent.ts` 包含 `socialMap` state 和 `fetchSocialMap(spaceId)` action
- [ ] `fetchSocialMap` 能成功加载 `/assets/tilemaps/{spaceId}/tilemap.json`

### Composables
- [ ] `src/webui/src/composables/usePixiApp.ts` 存在，导出 `usePixiApp(containerRef)` 返回 `{ app, ensureApp, destroyApp }`
- [ ] `usePixiApp` 在 onUnmounted 时正确销毁 PIXI.Application
- [ ] `src/webui/src/composables/usePixiViewport.ts` 存在，导出 `usePixiViewport(app)` 返回 `{ viewport }`
- [ ] viewport 配置了 drag/pinch/wheel 插件，minScale=0.5, maxScale=3
- [ ] `src/webui/src/composables/useCharacterSprite.ts` 存在，导出 `useCharacterSprite()` 返回 `{ createSprite, setDirection, setMoving }`

### Components
- [ ] `src/webui/src/components/social/SpaceSelector.vue` 存在，渲染 5 个空间 tab，emit `change` 事件
- [ ] `src/webui/src/components/social/PixiCanvas.vue` 存在，挂载 PIXI.Application 到 div ref
- [ ] `src/webui/src/components/social/TilemapLayer.vue` 存在，根据 tilemap.json 渲染 bgTiles + objectTiles + animatedSprites 三层
- [ ] `src/webui/src/components/social/CharacterLayer.vue` 存在，渲染林逸 + 当前空间 NPC 精灵
- [ ] 林逸精灵底部有金色高亮底座（与其他 NPC 视觉区分）
- [ ] `src/webui/src/components/social/GazeOverlay.vue` 存在，根据 gaze_intensity 显示红/绿半透明叠加
- [ ] NPC 精灵点击触发 `selectNpc(npcId)` 事件

### SocialView 集成
- [ ] `src/webui/src/views/SocialView.vue` 不再包含原 SVG `<div class="space-grid">` 块
- [ ] SocialView 顶部显示 SpaceSelector
- [ ] SocialView 中间显示 PixiCanvas（包含 TilemapLayer + CharacterLayer + GazeOverlay）
- [ ] SocialView 右侧保留 NpcDetails drawer（#22 实现）
- [ ] SocialView 底部保留遭遇时间线
- [ ] 空间切换时 PixiCanvas 正确加载新空间的 tilemap
- [ ] tilemap 加载中显示 loading 状态（spinner 或文字提示）

## 测试与构建

- [ ] `cd /workspace/src/webui && npm run build` 通过，无错误
- [ ] `cd /workspace && python -m pytest --ignore=tests/test_webui.py -q` 通过（无新增失败）
- [ ] `tools/gen_tilemaps.py` 和 `tools/gen_spritesheets.py` 可重复运行（幂等，覆盖输出）

## Git 与 Issue

- [ ] 代码已 commit 并推送到 `trae/agent-zMXkXJ` 分支
- [ ] GitHub issue #19 已关闭并附实现说明
- [ ] GitHub issue #20 已关闭并附实现说明
- [ ] GitHub issue #21 已关闭并附实现说明

## 资产可替换性

- [ ] 所有资产通过 URL 引用（`/assets/tilemaps/{id}/tileset.png` 等），未来用真实美术 PNG 替换无需改代码
- [ ] spritesheet JSON 格式与 ai-town spritesheetData 兼容，未来可直接替换为 LPC 或 ai-town MIT 资产
- [ ] tilemap JSON 格式与 Tiled 1.9 兼容，未来可用 Tiled 编辑器打开并修改
