"""Canonical event bus topic constants for the novelist brain.

Centralizing topic names here avoids typos and makes it easy to discover
all available topics. New topics introduced by the v2 refactor (per
docs/系统重构方案_v1.md §4.3 and §5.4) are grouped under REFACTOR_V2_TOPICS.
"""

from __future__ import annotations

# Legacy topics (preserved from IMPORTANT_TOPICS in main.py)
LEGACY_TOPICS: frozenset[str] = frozenset({
    "event.clock.phase.changed",
    "control.network.switch",
    "control.sandbox.build",
    "control.sandbox.simulate",
    "data.memory.trace.created",
    "data.sandbox.narrative.ready",
    "data.novel.paragraph",
    "event.novel.paragraph.published",
    "control.metabolism.budget.exhausted",
})

# New topics introduced by the v2 refactor (Stage 1 + Stage 2 subsets)
REFACTOR_V2_TOPICS: frozenset[str] = frozenset({
    # OC character system (Stage 1)
    "data.oc.created",
    "data.oc.updated",
    "data.oc.update.rejected",
    "data.oc.evolved",
    "control.oc.create",
    "control.oc.update",
    # World state (Stage 1)
    "data.sandbox.world.updated",
    # Scenario-driven simulation (Stage 1)
    "control.sandbox.scenario.load",
    # Chapter management & serialized planning (Stage 2, per §9 / §3.4 / §3.5)
    "data.novel.chapter.intent",       # Planner 输出 ChapterIntent
    "control.novel.chapter.write",    # 触发段落生成
    "event.novel.chapter.completed",   # 章节段落达 target
    "event.novel.chapter.committed",   # 章节定稿
    "event.novel.chapter.rollback",    # 章节版本回退
    "control.novel.chapter.rollback",  # 触发章节回退
    "control.novel.chapter.complete",  # 触发章节完成
    "control.novel.chapter.commit",    # 触发章节定稿
    # Audit & quality loop (Stage 4, per §4 / Task 4.3)
    "control.novel.audit",                 # 触发连续性审计
    "data.novel.audit.issues",             # ContinuityAuditor 输出的 ContinuityIssue 列表
    "data.novel.quality.report",           # QualityEngine 输出的质量报告
    "data.novel.quality.score",            # QualityEngine 输出的质量评分（0-1）
    "control.novel.revision.required",     # QualityEngine 触发的自动修订
    "control.novel.revision.human_required",  # QualityEngine 标记的需人工处理
    "data.novel.revision.applied",         # 修订应用完成
    # Visual debugging (Stage 5, per §5.4 / §9.5 / Task 5.1)
    "data.debug.world.snapshot",           # WorldVisualDebugger 世界快照（地点/势力/角色关系图）
    "data.debug.world.diff",               # WorldVisualDebugger 两个世界版本差异
    "data.debug.narrative.replay",         # WorldVisualDebugger COC 推演回放（含骰子与叙事影响）
})

ALL_TOPICS: frozenset[str] = LEGACY_TOPICS | REFACTOR_V2_TOPICS
