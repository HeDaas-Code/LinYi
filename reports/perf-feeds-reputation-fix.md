# 性能修复：feeds.rank 逐帖 reputation.query 造成的 3.9× 回归（t53）

- 代码提交：`e317580`（代码）+ 结构件提交（tree.json / outline.md / api-index.json / receipt.json + 模块 .md）
- 日期：2026-09-24

## 根因

captain 用 CPU profiler 定位：100 tick × 50 采样 5604 个样本，**58.9% 落在 structuredClone**，唯一热路径：

```
step → tick → runPlatform → feeds.generate → feeds.rank → (anon) → reputation.query → graph.read → clone → structuredClone
```

即 `feeds.rank` 在逐帖排序时对每个帖子调用一次 `reputation.query`，而 `reputation.query` 每次都 `graph.read` + 深拷贝（含 64 条 history）。每 tick 调用量随帖子数 × 居民数相乘增长。此外 `posts.reply/react/get/list`、`reputation.update` 同样存在逐次整帖/整历史的 `graph.read + structuredClone` 热点，`situationOf` 还逐帖重查全量企业列表。

## 修复内容（均为同款「按 id 缓存 + graph.__generation() 失效」做法，参考 episodic.store 的 ensureFresh）

1. **feeds.rank 批量化**：一次 `reputation.scoreMap()`（Map<agentId,score>）与一次 `edgeWeightMap()`（Map<"a:b",weight>）取全量，取代逐帖 `reputation.query` / `edges.between`；返回 `{...p, _score}` 取代 `{...structuredClone(p), _score}`。
2. **reputation.js 内存索引**：`byAgent` Map 缓存最新记录，读取（query/list/scoreMap/update）走索引不再 `graph.read`；落盘仅写标量（score/level/updatedAt），history 只存内存。
3. **posts.js 内存索引**：`byId` Map 缓存帖子，reply/react/get/list 走索引；落盘用 `persistData()` 剥离 replies 数组（只存内存）。
4. **移除冗余 clone**：publish/reply/react/update 直接返回新对象，不再额外 `clone()` 返回；query/list 不做双重克隆。
5. **situationOf 破产创始人集合**：每 tick 计算一次 `failedFounders Set`，不再逐帖 `economy.industry.business.list()`（图全量读取）。

## 性能对比（同口径 200 tick × 50 居民，phase2 only）

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 200 tick × 50 | 11711 ms（约 3.9×） | **3859 / 3862 / 3897 ms**（种子 1/2/3，best-of-3） |
| npm test 总耗时 | 182.7 s | **45.2 s**（380/380 全绿） |
| 50 居民 × 2000 tick | 明显不可接受 | **103.8 s**（< 180 s） |

修复后 CPU profile：`feeds.rank` / `reputation.query` 从热路径消失（top 条目中 < 0.4%），structuredClone 占比回落为共享 graph store 的固有开销，不再有逐帖深拷贝热点。

## 行为一致性（逐值，修复前后完全一致）

| 字段 | seed 1 | seed 2 | seed 3 |
| --- | --- | --- | --- |
| postCount | 853 | 825 | 867 |
| replyCount | 4993 | 4983 | 4953 |
| reactCount | 2602 | 2579 | 2523 |
| feedSignature[0] | agent_…0002 | agent_…0002 | agent_…0001 |
| rep.mean | 57.3096 | 58.1827 | 58.3202 |
| rep.min / max | 51.25 / 100 | 53.55 / 100 | 53.2 / 100 |
| trusted / distrusted | 2 / 0 | 2 / 0 | 2 / 0 |

声誉反馈对照保持：seed 1 `interestAccrued` 有反馈 **157.3005** vs 无反馈 **297**（未变）。

## 门禁

- `npm test`：**380 / 380 通过，0 失败**。
- `normify_validate`：**0 error**（仅 1 条项目既有 dep/unanchored 警告）。
- 模块指纹已刷新：`social.platform.posts`（d8ae82d4…）、`social.platform.feeds`（895306c8…）、`social.reputation`（a5793047…）。
