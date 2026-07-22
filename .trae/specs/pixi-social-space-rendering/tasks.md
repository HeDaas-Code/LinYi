# Tasks

## 阶段 1: 程序化资产生成（#19 + #20 替代方案）

- [ ] Task 1: 创建 `tools/gen_tilemaps.py` — 用 Pillow 生成 5 个空间的 tileset.png + tilemap.json
  - [ ] SubTask 1.1: 定义 5 个空间的调色板与 tile 类型清单（地砖/墙壁/家具/装饰/动画帧）
  - [ ] SubTask 1.2: 实现 `draw_tileset(space_id)` — 绘制 16×16 tileset PNG，每个空间至少 8 种 tile
  - [ ] SubTask 1.3: 实现 `build_tilemap_json(space_id)` — 生成 Tiled 1.9 兼容 JSON，三层 bgTiles/objectTiles/animatedSprites
  - [ ] SubTask 1.4: 实现动画 tile（广场喷泉 2 帧、咖啡馆蒸汽 2 帧、出租屋风扇 2 帧、车站站台灯 2 帧、夜市灯串 2 帧）
  - [ ] SubTask 1.5: 输出到 `src/webui/public/assets/tilemaps/{space_id}/`，验证 5 个空间尺寸符合 WEBUI-REFACTOR.md §4.3.7.11

- [ ] Task 2: 创建 `tools/gen_spritesheets.py` — 用 Pillow 生成 11 个角色的 spritesheet.png + spritesheet.json
  - [ ] SubTask 2.1: 定义 archetype → 颜色映射（stranger=灰、regular=绿、outsider=紫、authority=红、linyi=蓝）
  - [ ] SubTask 2.2: 实现 `draw_character_frame(color, direction, frame_idx)` — 绘制 32×32 像素人形（头/身/腿，4 方向姿态不同）
  - [ ] SubTask 2.3: 实现 `build_spritesheet_json()` — 生成 ai-town 兼容 JSON（frames=16, frameSize=32×32, animations 索引）
  - [ ] SubTask 2.4: 为林逸 + 10 NPC 各生成一套，输出到 `src/webui/public/assets/spritesheets/{character_id}.png + .json`

## 阶段 2: PixiJS 渲染层（#21 主体）

- [ ] Task 3: 安装 npm 依赖并配置 TypeScript
  - [ ] SubTask 3.1: `cd src/webui && npm install pixi.js@^8 pixi-viewport@^5`
  - [ ] SubTask 3.2: 更新 `src/webui/src/env.d.ts` 声明静态资源模块（*.png, *.json）
  - [ ] SubTask 3.3: 验证 `npm run build` 编译通过

- [ ] Task 4: 实现类型定义与 store 扩展
  - [ ] SubTask 4.1: 在 `src/webui/src/types.ts` 添加 `TilemapData` / `TileLayer` / `SpritesheetData` / `CharacterSpriteState` 类型
  - [ ] SubTask 4.2: 在 `src/webui/src/stores/agent.ts` 添加 `socialMap: TilemapData | null` state + `fetchSocialMap(spaceId)` action
  - [ ] SubTask 4.3: `fetchSocialMap` 通过 fetch 加载 `/assets/tilemaps/{spaceId}/tilemap.json`

- [ ] Task 5: 实现 composables（PixiJS 生命周期封装）
  - [ ] SubTask 5.1: `usePixiApp.ts` — 创建 PIXI.Application，挂载到容器 div，resize 监听，onUnmounted 销毁
  - [ ] SubTask 5.2: `usePixiViewport.ts` — 包裹 pixi-viewport，配置拖拽/缩放/滚轮/减速，minScale=0.5, maxScale=3
  - [ ] SubTask 5.3: `useCharacterSprite.ts` — 从 spritesheet PNG + JSON 构造 PIXI.AnimatedSprite，提供 setDirection/setMoving/play 方法

- [ ] Task 6: 实现 social 子组件
  - [ ] SubTask 6.1: `SpaceSelector.vue` — 5 空间 tab 按钮，高亮当前空间，emit `change` 事件
  - [ ] SubTask 6.2: `PixiCanvas.vue` — 容器组件，使用 usePixiApp + usePixiViewport，slot 或 props 传入子 layer
  - [ ] SubTask 6.3: `TilemapLayer.vue` — 加载 tileset.png 作为 baseTexture，按 tilemap.json 数据绘制 bgTiles + objectTiles + animatedSprites
  - [ ] SubTask 6.4: `CharacterLayer.vue` — 遍历当前空间可见 NPC + 林逸，调用 useCharacterSprite 渲染 AnimatedSprite
  - [ ] SubTask 6.5: `GazeOverlay.vue` — 根据 current.gaze_intensity 渲染半透明矩形覆盖整个 viewport

## 阶段 3: SocialView 集成与验证

- [ ] Task 7: 改造 SocialView.vue 集成 PixiCanvas
  - [ ] SubTask 7.1: 删除原 SVG 空间网格块（`<div class="space-grid">`）
  - [ ] SubTask 7.2: 添加 SpaceSelector + PixiCanvas 组合到主区域
  - [ ] 7.3: 接线 NPC 精灵点击 → selectNpc(npcId) → 右侧 NpcDetails drawer
  - [ ] SubTask 7.4: 保留底部遭遇时间线 + 右侧 NpcDetails（#22 已实现）
  - [ ] SubTask 7.5: 添加加载/错误状态（tilemap 加载中显示 spinner）

- [ ] Task 8: 构建与测试验证
  - [ ] SubTask 8.1: `cd src/webui && npm run build` — TypeScript + Vite 构建通过
  - [ ] SubTask 8.2: `python -m pytest --ignore=tests/test_webui.py -q` — 无回归
  - [ ] SubTask 8.3: 手动启动 dev server 验证 SocialView 渲染（可选）

## 阶段 4: Git 推送与 issue 关闭

- [ ] Task 9: 提交并推送代码
  - [ ] SubTask 9.1: `git add -A && git commit` 用规范 commit message
  - [ ] SubTask 9.2: 推送到 `trae/agent-zMXkXJ` 分支

- [ ] Task 10: 关闭 GitHub issues
  - [ ] SubTask 10.1: `gh issue close 19 --reason completed` 并附实现说明 comment
  - [ ] SubTask 10.2: `gh issue close 20 --reason completed` 并附实现说明 comment
  - [ ] SubTask 10.3: `gh issue close 21 --reason completed` 并附实现说明 comment

# Task Dependencies

- Task 2 独立于 Task 1，可并行
- Task 3 独立于 Task 1/2，可并行（npm install 与资产生成无依赖）
- Task 4 依赖 Task 3（需要类型定义先于 store）
- Task 5 依赖 Task 3 + Task 4（composables 使用类型）
- Task 6 依赖 Task 5（组件使用 composables）
- Task 7 依赖 Task 1 + Task 2 + Task 6（需要资产 + 组件就绪）
- Task 8 依赖 Task 7
- Task 9 依赖 Task 8
- Task 10 依赖 Task 9

# 并行化建议

- 阶段 1 的 Task 1 + Task 2 + 阶段 2 的 Task 3 可三个 sub-agent 并行执行
- Task 5 三个 composable 文件可并行编写（usePixiApp / usePixiViewport / useCharacterSprite）
- Task 6 五个组件部分可并行（SpaceSelector / GazeOverlay 简单，TilemapLayer / CharacterLayer 复杂）
