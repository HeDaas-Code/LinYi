# Project AIRI 表情与躯体表达交叉分析

> 来源：[moeru-ai/airi](https://github.com/moeru-ai/airi)（`packages/stage-ui*`、`packages/stage-ui-live2d`、`docs/blog/DevLog-2025.04.14` 等源码交叉整理）
> 整理日期：2026-07-22
> 分析范围：表情系统、跨渲染器映射、自主躯体行为、LLM 工具暴露、记忆情绪分数。

---

## 1. 项目定位与借鉴价值

Project AIRI 是一个自托管的 AI VTuber / 数字生命框架，核心目标是让角色不仅能聊天，还能以**持续存在的身体形象**进行实时互动。其 Stage 子系统支持 VRM、Live2D、MMD、Spine 等多种渲染器，并统一用一套 `Emotion` 词汇驱动。

对 LinYi 的借鉴价值不在于直播/VTuber 本身，而在于 AIRI 把以下三件事当作一等公民：

1. **统一情绪词汇**：LLM、记忆、表情、动作都使用同一套 `Emotion` 枚举，避免各模块各自造词。
2. **渲染器无关的表达层**：表情不直接绑定到 VRM BlendShape 或 Live2D 参数，而是先映射到逻辑 morph slot，再由运行时解析到具体模型。
3. **身体存在感的自主行为**：眨眼、眼跳（saccade）、注视、idle 呼吸等让角色在屏幕上有"活着"的感觉，而非只在收到消息时才换表情。
4. **LLM 直接驱动表情**：通过 MCP / tool 暴露 `expression.set` / `expression.toggle` 等接口，让 LLM 自己决定何时露出什么表情。
5. **记忆的情绪化**：记忆条目带有正向/负向情绪分数，影响回忆优先级与角色心境。

---

## 2. AIRI 表情系统技术细节

### 2.1 统一情绪枚举

所有渲染器共享同一 `Emotion` 枚举（`packages/stage-ui/src/constants/emotions.ts`）：

```ts
export enum Emotion {
  Happy = 'happy',
  Sad = 'sad',
  Angry = 'angry',
  Think = 'think',
  Surprise = 'surprised',
  Awkward = 'awkward',
  Question = 'question',
  Curious = 'curious',
  Neutral = 'neutral',
}
```

并维护到各渲染器具体名称的映射：

- `EMOTION_VRMExpressionName_value`：VRM BlendShape 名（如 `happy`/`sad`/`surprised`）。
- `EMOTION_EmotionMotionName_value`：动作/姿态名（如 `Happy`/`Idle`/`Think`）。
- `EMOTION_SpineAnimationName_value`：Spine 动画名。

这让 Stage 的核心事件总线可以只发送 `{ name: Emotion, intensity: number }`，由具体渲染器自行解析。

### 2.2 跨渲染器 Morph 解析（MMD 为例）

AIRI 在 MMD 渲染器中不硬编码 morph 名，而是定义逻辑 `MorphSlot`，每个 slot 带有一组候选名（日文优先、英文回退）：

```ts
export const MORPH_CANDIDATES: Record<MorphSlot, readonly string[]> = {
  smile: ['笑い', 'にこり', 'わらい', 'smile', 'Smile'],
  anger: ['怒り', 'いかり', 'anger', 'Anger'],
  sad:   ['悲しい', '悲しむ', 'sad', 'Sad'],
  // ...
}
```

运行时按顺序查找模型实际存在的 morph 名，首次命中即使用。这解决了不同模型作者命名不一致的问题，值得 LinYi 的 `expression_targets` 学习。

### 2.3 VRM 表情插值

`packages/stage-ui-three/src/composables/vrm/expression.ts` 实现了：

- **全量表达式过渡**：切换情绪时先捕获当前所有 BlendShape 值作为起点，再按目标情绪重新设置目标值，避免"先归零再渐入"的硬切。
- **easeInOutCubic 缓动**：`transitionProgress += deltaTime / blendDuration`，用三次缓动插值。
- **强度缩放**：目标值乘以 `clampIntensity(intensity)`，主表情权重控制在 0.7–0.8，避免#590提到的"笑得太Raw"。
- **自动回退 neutral**：`setEmotionWithResetAfter(emotion, ms, intensity)` 可在指定毫秒后回到 neutral。

表情定义示例：

```ts
['happy', {
  expression: [
    { name: 'happy', value: 0.7, duration: 0.3 },
    { name: 'aa',    value: 0.2 },
  ],
  blendDuration: 0.4,
}]
```

### 2.4 Live2D 表情控制器

`packages/stage-ui-live2d/src/composables/live2d/expression-controller.ts` 解析 Live2D 的 `model3.json` + `exp3.json`，将表情参数注册到 Pinia store：

- 支持三种 blend mode：`Add` / `Multiply` / `Overwrite`。
- 每帧检测"生效→失效"的参数并显式写回 model default，避免残留。
- Multiply 模式读取当前帧参数（已应用眨眼/动作后的值）再缩放，因此自动眨眼不会被表情覆盖。

### 2.5 自主躯体行为

AIRI 的身体存在感来自多个低层系统：

- **眼跳（saccade）**：`randomSaccadeInterval()` 根据概率表生成 800ms–数秒之间的随机眼跳间隔，模拟真实眼球微动。
- **注视跟踪**：`useLive2DEyeFocusFor` 将鼠标/摄像头坐标映射为 Live2D 模型眼焦点。
- **自动眨眼**：由 Live2D/MMD 底层眨眼插件周期性驱动，与表情系统通过 Multiply blend 共存。
- **Idle 动作/呼吸**：VRM/MMD 的 idle 动画循环播放，与表情层叠加。

这些行为不依赖 LLM，而是底层 Stage 的"生命体征"。

### 2.6 LLM 表情工具

`packages/stage-ui-live2d/src/tools/expression-tools.ts` 把表情控制暴露为 MCP 工具：

- `expression_set(name, value, duration?)`
- `expression_get(name?)`
- `expression_toggle(name, duration?)`
- `expression_save_defaults()`
- `expression_reset_all()`

工具返回 JSON 序列化的状态，LLM 可以读取当前可用表情并主动调用。这对 LinYi 的 `ToolUseModule` 是重要参考。

### 2.7 记忆的情绪分数

DevLog-2025.04.14 提出在记忆数据库中增加"欢欣"和"厌恶"分数：

- 记忆不仅有 recency / importance / relevance，还有 emotional valence。
- 正/负向记忆会影响检索排序与角色心境。
- PTSD/闪回可用随机数模拟"被压抑记忆的突然冒出"。

LinYi 的 `MemoryStream` 目前只有 importance，尚未引入情绪 valence。

---

## 3. LinYi 现状对照

### 3.1 已对齐的部分

| AIRI 设计 | LinYi 现状 | 状态 |
|---|---|---|
| 统一 Emotion 枚举 | `expression_state.py` 的 `EMOTION_PROFILES` 已包含 happy/sad/angry/surprised/think/awkward/question/curious/neutral | ✅ 已对齐 |
| 情绪强度 | `ExpressionState._intensity` 由 arousal 与 reader_temperature 计算 | ✅ 已对齐 |
| blend_duration | `EmotionProfile.blend_duration` 已输出 | ✅ 已对齐 |
| expression_targets | `EmotionProfile.expression_targets` 已输出 | ✅ 已对齐 |
| action / motion hint | `EmotionProfile.action` 已输出 | ✅ 已对齐 |
| 社交→情绪→表情 | `SocialVitalBridge` 监听社交事件并输出 `data.metabolism.state`，`ExpressionState` 再转表情 | ✅ 已对齐 |
| 情绪衰减回基线 | `SocialVitalBridge.tick()` 已按 `decay_per_hour` 衰减 | ✅ 已对齐 |

### 3.2 尚未覆盖的差距

| AIRI 设计 | LinYi 差距 | 优先级 |
|---|---|---|
| `relaxed` 情绪 | `EMOTION_PROFILES` 缺少 relaxed，AIRI VRM 已支持 | 高 |
| 身体/姿态参数（blink_rate, gaze_target, breath_speed, pose） | `ExpressionState` 只输出表情，没有 autonomous body state | 高 |
| 表情自动回退 neutral | `ExpressionState` 无 `setEmotionWithResetAfter` 机制 | 高 |
| 跨渲染器 morph 候选解析 | `expression_targets` 直接写死 `happy`/`aa` 等，未做候选回退 | 中 |
| LLM 表情工具 | `ToolUseModule` 尚未注册表情相关工具 | 中 |
| 记忆情绪分数 | `MemoryStreamEntry` 无 emotional valence 字段 | 中 |
| 眼跳/注视/自动眨眼 | 前端尚未实现，后端可先输出目标参数 | 低 |
| 表情缓动曲线 | 仅输出 blend_duration，未输出 ease function | 低 |

---

## 4. 对 LinYi 的补强建议

### 4.1 立即落地（本阶段）

1. **补齐 `relaxed` 情绪**
   - 在 `EMOTION_PROFILES` 增加 `relaxed`，对应 AIRI VRM 的 `relaxed` BlendShape。
   - 将 mood_bias "平静" + 低 arousal 映射到 `relaxed`，而非仅 `neutral_calm`。

2. **引入 `BodyState` 躯体状态输出**
   - 在 `ExpressionState` 增加并输出：
     - `blink_rate`：每分钟眨眼次数（随 arousal 变化，兴奋时眨眼略快，困倦时变慢）。
     - `gaze_target`：注视目标 `{x, y, z}`，可基于读者消息来源方向或随机 idle 点。
     - `breath_speed`：呼吸/idle 速度倍率（兴奋时加快，平静时放慢）。
     - `pose`：姿态提示（`idle` / `lean_forward` / `cross_arms` / `head_tilt`）。
   - 这些参数让前端即使暂时不用 VRM，也能渲染出"活着"的细微动作。

3. **表情自动回退机制**
   - 为每个 `EmotionProfile` 增加可选 `default_duration`（秒）。
   - 当情绪由社交事件触发时，在 `default_duration` 后自动衰减回 neutral/relaxed。
   - 在 `ExpressionState` 中记录 `reset_at` 时间戳，供前端与状态视图使用。

4. **Payload 增加 `body_state` 与 `reset_at`**
   - `data.expression.changed` 事件一并输出表情参数与躯体参数，减少前端集成成本。

### 4.2 下一阶段（ architecture roadmap 中跟进）

5. **跨渲染器 morph 候选解析**
   - 将 `expression_targets` 从 `dict[str, float]` 扩展为支持候选列表：`{"smile": ["笑い", "にこり", "smile"], ...}`，或保持输出 `dict[str, float]` 但增加 `candidate_names` 字段。
   - 前端根据实际模型支持的 morph 名匹配。

6. **LLM 表情工具**
   - 在 `ToolUseModule` 注册 `expression_set` / `expression_get` / `expression_reset` 工具。
   - 让林逸在特定情境下可以主动"露出"表情，增强拟人化。

7. **记忆情绪分数**
   - 为 `MemoryStreamEntry` 增加 `valence: float`（-1 到 1）与 `arousal: float`。
   - `SocialVitalBridge` 在写入社交记忆时附带情绪分数。
   - 检索时把 emotional salience 作为额外排序因子。

8. **眼跳与注视目标生成**
   - 后端可基于当前对话对象、鼠标/触摸事件或随机 idle 点生成 `gaze_target`。
   - 引入 `random_saccade_interval()` 风格的随机间隔，输出下一次眼跳时间。

---

## 5. 与现有架构的衔接

```text
SocialVitalBridge
    -> data.metabolism.state (mood_bias / arousal / reader_temperature / creative_drive)
        -> ExpressionState
            -> data.expression.changed
                -> emotion / intensity / blend_duration / expression_targets / action
                -> body_state { blink_rate, gaze_target, breath_speed, pose }
                -> reset_at (auto-decay timestamp)
            -> 可被 PromptSurface 的 expression_hint 槽位消费
            -> 可被 ToolUseModule 的 expression_* 工具反向控制
```

---

## 6. 结论

Project AIRI 给 LinYi 最重要的启示是：**虚拟生命的"存在感"不仅来自 LLM 说了什么，还来自持续运转的身体与情绪系统**。LinYi 已经在情绪-社交桥接与渲染器无关的表情输出上做了扎实工作，下一步应重点补齐：

- `relaxed` 情绪与更精细的 mood→emotion 映射；
- `BodyState` 躯体参数，让前端能表现眨眼、呼吸、注视等自主行为；
- 表情自动回退机制，避免社交事件永久锁定表情；
- 将表情控制通过 `ToolUseModule` 暴露给 LLM，形成"情绪→表情→LLM 再调控表情"的闭环。

这些改动将显著提升林逸作为"生活在电脑中的虚拟生命"的拟真度。
