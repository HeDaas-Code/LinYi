# truman-town 真实模型小基线报告（A6API）

- 生成时间：2026-09-22T17:38:32.388Z
- provider：a6api
- 参数快照：{"decay":{"food":0.01,"water":0.01},"needGrowth":{"food":0.08,"water":0.08},"eventProbability":0.3,"epidemicThreshold":0.5,"procreationMatchThreshold":0.3,"tagCount":50,"sharedTagCount":45,"ritualInterval":2,"traumaRate":0.2,"breakThreshold":0.7}
- 硬上限：未触发（实际 40 次 < 上限）
- 抽样方式：realEvery 抽样（每 N 次 complete 调用中 1 次走真实模型、其余走 stub）
- 复跑命令：`timeout 1500 node --env-file=.env bin/bench.js --ticks 30 --agents 4 --seeds 1 --provider real --real-every 3 --real-cap 150 --out bench-out/real --report real`

## 运行概况

- 规模：4 居民 × 30 tick，最终 tick 30，存活率 1.000
- 日志：decision=120 action=120 event=14 total=254
- 总墙钟：1063716 ms，每 tick 平均 35457.20 ms

## 真实调用统计

- 实际真实调用次数：40
- 总 token：prompt=23283 completion=30706 reasoning=0 合计=53989
- cost_in_usd_ticks 合计：2239020000
- 失败次数：0，重试次数：0
- gateway 统计：requests=120 successes=120 failures=0

## 延迟分布（真实调用，ms）

- 样本数：40
- min=13581 max=55089 mean=26589
- p50=26169 p90=35399

## 结论：真实模型适合多大场景

- 单次调用 p50 延迟约 26169 ms；核心主循环每 tick 约 4.0 次 LLM 调用 → 每 tick 纯推理耗时约 104674 ms。
- 线性外推（不含排队/重试）：
  - 4 居民 × 30 tick ≈ 120 次调用 ≈ 3140 秒真实推理
  - 10 居民 × 100 tick ≈ 1000 次调用 ≈ 26169 秒真实推理
  - 50 居民 × 1000 tick ≈ 50000 次调用 ≈ 1308425 秒真实推理
- 结论：真实模型适合小规模、短时段交互/演示与抽样评估（≤10 居民 × ≤100 tick 且采用 realEvery 抽样）；50 居民 × 2000 tick 全真实调用不可行（约 10 万次调用、数小时级且成本高），应保持 stub 或抽样。

## 已知限制

- provider.a6api 无超时/AbortSignal：上游挂起会无限等待，本次运行靠外层 timeout 兜底（t30 后加固）。
- A6API 无 embedding 模型，embed() 不支持并回退 stub。
- 抽样 realEvery 只统计真实调用；token/cost 仅来自真实调用样本。
