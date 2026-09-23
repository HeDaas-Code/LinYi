# 难度档位（Difficulty）

把 needGrowth 与采集池等已调好的生存参数，产品化为四个可操作的“难度档位”，
通过现有 API 控制面（`src/api/control.js`）暴露，而不是只能改命令行参数。

## 1. 四档含义与实测依据

档位定义在 `src/infra/config.js` 的 `DIFFICULTY_PRESETS`。标准档参数严格等于 `DEFAULTS`，
保证既有行为不变；其余各档的“预期存活表现”来自 `reports/bench-tuned.md` 与 t33 验收数据
（50 居民 × 200 tick 默认局，phase2+phase3 全开，needGrowth 四档死亡 tick 中位 200 / 33~46 / 20 / 19）。

| 档位 id | 名称 | needGrowth | eventProbability | forageRegen | foragePoolCapacity | forageRegenPerCapita | foragePoolPerCapita | 预期表现（50 居民） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `peaceful` | 和平 | 0.04 | 0.15 | 12 | 40 | 0.20 | 1.5 | 稳定存活 200 tick，资源富余 |
| `standard` | 标准（默认） | 0.08 | 0.30 | 8 | 30 | 0.15 | 1.0 | 存活 200 tick（死亡 tick 中位 200） |
| `harsh` | 严酷 | 0.12 | 0.30 | 8 | 30 | 0.15 | 1.0 | 约 33~46 tick 全灭 |
| `apocalyptic` | 末日 | 0.16 | 0.30 | 8 | 30 | 0.15 | 1.0 | 约 17~19 tick 全灭 |

> 依据：needGrowth 四档扫描的死亡 tick 中位为 0.08→200、0.12→33~46、0.14→20、0.16→19（单调恶化）。
> 其中 `standard`/`harsh`/`apocalyptic` 对应 0.08/0.12/0.16 三点，`peaceful` 取 0.04（低于约 0.06 的生存阈值，
> 见 `reports/bench-tuned.md` 第 4 节），并额外上调采集池与下调事件频率，进一步拉大与标准档的差异。

## 2. API 用法

三个端点都挂在 `/api/v1/sim/` 下（与 start/pause/step 同一控制面），风格一致：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/sim/difficulties` | 列出全部档位（含参数与预期表现 + `current` 标记） |
| `GET` | `/api/v1/sim/difficulty` | 查询当前档位 |
| `POST` | `/api/v1/sim/difficulty` | 切换档位（body：`{"id": "harsh"}` 或 `{"difficulty": "harsh"}`） |

切换后**新建的 run** 生效（`loop.run` 会把当前档位参数作为基础叠加，显式传入的 run 参数仍可覆盖），
不热改正在运行中的模拟。

### curl 示例

```bash
# 列出全部档位
curl -s http://127.0.0.1:PORT/api/v1/sim/difficulties

# 查询当前档位
curl -s http://127.0.0.1:PORT/api/v1/sim/difficulty

# 切换到严酷档
curl -s -X POST http://127.0.0.1:PORT/api/v1/sim/difficulty \
  -H 'Content-Type: application/json' \
  -d '{"id": "harsh"}'

# 非法档位 → 404 { "error": "unknown difficulty: ..." }
curl -s -X POST http://127.0.0.1:PORT/api/v1/sim/difficulty \
  -H 'Content-Type: application/json' \
  -d '{"id": "nope"}'
```

### 代码调用

```js
import * as control from './src/api/control.js';
import * as config from './src/infra/config.js';

control.setDifficulty('apocalyptic'); // 切换（抛 HttpError 400/404）
const current = config.getDifficulty();  // { id, label, expected, params }
```

## 3. 自定义档位

档位是 `src/infra/config.js` 里的一个冻结对象。新增或调整档位时：

1. 在 `DIFFICULTY_PRESETS` 里加/改一个条目，`params` 只需给出你要覆盖的运行参数
   （`needGrowth` / `eventProbability` / `foragePoolCapacity` / `forageRegen` /
   `foragePoolPerCapita` / `forageRegenPerCapita`），其余参数沿用 `DEFAULTS`。
2. 每个参数都必须能通过 `config.validate()`（如 `eventProbability` ∈ [0,1]、`foragePoolCapacity` > 0）。
3. 在 `expected` 字段写明该档的预期存活表现（建议附实测 tick 数据），供调用方理解。
4. 运行 `npm test` 与 `normify_validate` 收尾。

```js
// 例：新增一档 “hunger_games”
export const DIFFICULTY_PRESETS = Object.freeze({
  // ...既有四档...
  hunger_games: Object.freeze({
    label: '饥饿游戏 / Hunger Games',
    expected: '50 居民约 10 tick 全灭（示例）',
    params: Object.freeze({
      needGrowth: Object.freeze({ food: 0.3, water: 0.3 }),
      eventProbability: 0.6,
    }),
  }),
});
```

> 注意：`DIFFICULTY_PRESETS` 只列出“覆盖项”；切换档位时 `loop.step` 先把档位参数叠加到 `DEFAULTS` 上，
> 再用调用方显式传入的参数覆盖。因此档位里未写的参数不会被清零。
