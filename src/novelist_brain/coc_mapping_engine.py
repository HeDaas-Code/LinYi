"""COC 动态映射引擎 (Task 3.1)。

按 docs/系统重构方案_v1.md §3.6 COCMappingEngine、§5 COC 动态映射、§9 阶段三
实现 4 个子任务：

- SubTask 3.1.1: 订阅 ``control.module.init`` / ``data.sandbox.world.updated`` /
  ``data.oc.evolved`` / ``control.coc.scenario.request``，并在 ``init(context)``
  中读取 ``story_bible`` / ``world_contract`` / ``character_registry``。
- SubTask 3.1.2: ``build_rulebook(genre, world_rules) -> Rulebook``，5 个题材
  分支（克苏鲁/神秘、都市/现实、古代/历史、科幻/未来、奇幻/魔法）+ 默认 fallback。
- SubTask 3.1.3: ``build_campaign_arc(plot_compass) -> dict``，5 阶段模板
  （introduction → rising_action → turning_point → climax → falling_action），
  按 ``scale`` 调整章节占比、按 ``ending_intent`` 调整 climax 强度。
- SubTask 3.1.4: ``build_chapter_scenario(...) -> dict``，生成章节场景并发布
  ``control.sandbox.scenario.load``，同时响应 ``control.coc.scenario.request``。

本模块不修改 ``topics.py``（topic 字符串作为字面量使用），不修改
``trpg_rulebook.py``（Task 3.2 负责）或 ``cen.py``（Task 3.3 负责）。
"""

from __future__ import annotations

import os
import uuid
from typing import Any, Callable

from src.novelist_brain.models import (
    BusMessage,
    ChapterIntent,
    ModuleState,
    OCCharacterSheet,
    PlotCompass,
    StoryBible,
    TickDelta,
    WorldRule,
    WorldStateContract,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import PersistenceManager
from src.novelist_brain.trpg_rulebook import Rulebook


# ---------------------------------------------------------------------------
# Topic 字面量（按任务约束不修改 topics.py）
# ---------------------------------------------------------------------------
TOPIC_CONTROL_MODULE_INIT = "control.module.init"
TOPIC_DATA_SANDBOX_WORLD_UPDATED = "data.sandbox.world.updated"
TOPIC_DATA_OC_EVOLVED = "data.oc.evolved"
TOPIC_CONTROL_COC_SCENARIO_REQUEST = "control.coc.scenario.request"
TOPIC_CONTROL_SANDBOX_SCENARIO_LOAD = "control.sandbox.scenario.load"


# ---------------------------------------------------------------------------
# 题材关键词分组（SubTask 3.1.2）
# ---------------------------------------------------------------------------
_CTHULHU_GENRE_TOKENS: tuple[str, ...] = (
    "克苏鲁", "cthulhu", "cosmic", "lovecraft", "神秘", "mystery", "horror",
)
_URBAN_GENRE_TOKENS: tuple[str, ...] = (
    "都市", "现实", "urban", "modern", "contemporary", "悬疑",
)
_ANCIENT_GENRE_TOKENS: tuple[str, ...] = (
    "古代", "古风", "历史", "ancient", "historical", "wuxia", "武侠",
)
_SCIFI_GENRE_TOKENS: tuple[str, ...] = (
    "科幻", "未来", "sci-fi", "scifi", "future", "cyberpunk", "赛博",
)
_MAGIC_GENRE_TOKENS: tuple[str, ...] = (
    "奇幻", "魔法", "fantasy", "magic", "西幻",
)


def _match_genre(genre: str) -> str:
    """通过关键词匹配返回规范题材标识（小写）。"""
    g = (genre or "").lower()
    if any(tok in g for tok in _CTHULHU_GENRE_TOKENS):
        return "cthulhu"
    if any(tok in g for tok in _URBAN_GENRE_TOKENS):
        return "urban"
    if any(tok in g for tok in _ANCIENT_GENRE_TOKENS):
        return "ancient"
    if any(tok in g for tok in _SCIFI_GENRE_TOKENS):
        return "scifi"
    if any(tok in g for tok in _MAGIC_GENRE_TOKENS):
        return "magic"
    return "default"


# ---------------------------------------------------------------------------
# Campaign Arc 5 阶段模板 (SubTask 3.1.3)
# ---------------------------------------------------------------------------
# (phase, name_zh, summary)
_CAMPAIGN_STAGES: tuple[tuple[str, str, str], ...] = (
    ("introduction", "引入", "建立世界观、主要角色与基本冲突，给读者代入感。"),
    ("rising_action", "上升", "推进主线，加深冲突，逐步揭示世界规则与伏笔。"),
    ("turning_point", "转折", "重大转折打破原有平衡，主角面临关键抉择。"),
    ("climax", "高潮", "核心冲突集中爆发，主题与伏笔在此兑现。"),
    ("falling_action", "余韵", "高潮后的余波与情感回落，为结局定调。"),
)

# scale -> (total_chapters, (intro, rising, turning, climax, falling) ratios)
_SCALE_CHAPTERS: dict[str, tuple[int, tuple[float, float, float, float, float]]] = {
    "short": (5, (0.25, 0.25, 0.20, 0.20, 0.10)),
    "medium": (12, (0.15, 0.25, 0.20, 0.25, 0.15)),
    "long": (24, (0.10, 0.25, 0.20, 0.30, 0.15)),
}

# ending_intent 关键词 → climax 强度（[0.0, 1.0]）
_BITTER_INTENT_TOKENS: tuple[str, ...] = (
    "悲剧", "bitter", "dark", "黑暗", "bad ending", "bad-ending", "苦", "sad", "虐",
)
_HAPPY_INTENT_TOKENS: tuple[str, ...] = (
    "温暖", "happy", "光", "good ending", "good-ending", "甜", "爽",
)
_AMBIGUOUS_INTENT_TOKENS: tuple[str, ...] = (
    "开放", "ambiguous", "open", "留白", "悬",
)


def _ending_intent_to_climax_intensity(ending_intent: str) -> float:
    """根据 ``ending_intent`` 关键词推断 climax 强度。"""
    text = (ending_intent or "").lower()
    if not text:
        return 0.70
    if any(tok in text for tok in _BITTER_INTENT_TOKENS):
        return 0.95
    if any(tok in text for tok in _HAPPY_INTENT_TOKENS):
        return 0.65
    if any(tok in text for tok in _AMBIGUOUS_INTENT_TOKENS):
        return 0.80
    return 0.70


# ---------------------------------------------------------------------------
# 阶段级元数据 (SubTask 3.1.4)
# ---------------------------------------------------------------------------
_PHASE_OBJECTIVES: dict[str, str] = {
    "introduction": "建立世界观与主要角色，给读者代入感。",
    "rising_action": "推进主线冲突，揭示关键规则与伏笔。",
    "turning_point": "重大转折打破平衡，迫使主角做出抉择。",
    "climax": "核心冲突爆发，主题与伏笔集中兑现。",
    "falling_action": "高潮余波与情感回落，为结局定调。",
}

_PHASE_CONFLICTS: dict[str, str] = {
    "introduction": "主角与未知世界的初次碰撞。",
    "rising_action": "多方势力交锋，矛盾升级。",
    "turning_point": "真相揭露导致价值崩塌。",
    "climax": "终极对决与抉择。",
    "falling_action": "战后重建与情感清算。",
}

_PHASE_CHECKS: dict[str, list[dict[str, Any]]] = {
    "introduction": [
        {"skill": "观察", "difficulty": 0.3, "purpose": "建立对环境的基本认知"},
        {"skill": "心理学", "difficulty": 0.3, "purpose": "初步判断关键 NPC 立场"},
    ],
    "rising_action": [
        {"skill": "调查", "difficulty": 0.5, "purpose": "搜集推进主线的关键线索"},
        {"skill": "说服", "difficulty": 0.5, "purpose": "争取盟友或获取情报"},
    ],
    "turning_point": [
        {"skill": "心理学", "difficulty": 0.6, "purpose": "识破关键真相或动机"},
        {"skill": "观察", "difficulty": 0.5, "purpose": "察觉局势转折的征兆"},
    ],
    "climax": [
        {"skill": "格斗", "difficulty": 0.7, "purpose": "应对核心冲突的身体对抗"},
        {"skill": "意志", "difficulty": 0.7, "purpose": "在极端压力下保持理智"},
    ],
    "falling_action": [
        {"skill": "说服", "difficulty": 0.4, "purpose": "善后交涉"},
        {"skill": "观察", "difficulty": 0.3, "purpose": "确认结局状态"},
    ],
}


# ---------------------------------------------------------------------------
# COCMappingEngine
# ---------------------------------------------------------------------------


class COCMappingEngine(Module):
    """COC 动态映射引擎。

    将小说题材映射为 COC Rulebook 配置 + 章节场景，发布
    ``control.sandbox.scenario.load`` 让 MentalSandbox 加载场景。
    """

    def __init__(
        self,
        name: str = "coc_mapping_engine",
        novel_id: str = "linyi_default",
    ) -> None:
        super().__init__(name)
        self._novel_id: str = novel_id
        self._state_dir: str = "coc_mapping_state"
        self._state_path: str = os.path.join(self._state_dir, f"{novel_id}.json")

        # 真源（只读）
        self._story_bible: StoryBible | None = None
        self._world_contract: WorldStateContract | None = None
        self._character_registry: list[OCCharacterSheet] = []

        # 派生产物
        self._rulebook: Rulebook | None = None
        self._campaign_arc: dict[str, Any] | None = None
        self._scenarios: dict[int, dict[str, Any]] = {}

        self.subscribe(
            TOPIC_CONTROL_MODULE_INIT,
            TOPIC_DATA_SANDBOX_WORLD_UPDATED,
            TOPIC_DATA_OC_EVOLVED,
            TOPIC_CONTROL_COC_SCENARIO_REQUEST,
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "coc_mapping_engine",
            "version": "0.1.0",
            "description": (
                "COC 动态映射引擎：将小说题材映射为 COC Rulebook + 章节场景。"
            ),
            "dependencies": [],
            "category": "novel_source",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.15,
            custom={
                "novel_id": "",
                "genre": "",
                "rulebook_built": False,
                "campaign_arc_built": False,
                "scenario_count": 0,
            },
        )

    # ------------------------------------------------------------------
    # 生命周期 (SubTask 3.1.1)
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        """从 agent context 初始化。

        期望的 context key：
        - ``story_bible``: ``StoryBible | dict | None``
        - ``world_contract``: ``WorldStateContract | dict | None``
        - ``character_registry``: ``list[OCCharacterSheet] | None``
        - ``novel_v2``: ``{'novel_id': str, 'coc_mapping_state_dir': str}``
        """
        novel_v2 = context.get("novel_v2") or {}
        if isinstance(novel_v2, dict):
            new_novel_id = novel_v2.get("novel_id")
            if new_novel_id:
                self._novel_id = str(new_novel_id)
            new_dir = novel_v2.get("coc_mapping_state_dir")
            if new_dir:
                self._state_dir = str(new_dir)
        self._state_path = os.path.join(self._state_dir, f"{self._novel_id}.json")
        self._state.custom["novel_id"] = self._novel_id

        sb = context.get("story_bible")
        if isinstance(sb, StoryBible):
            self._story_bible = sb
        elif isinstance(sb, dict):
            try:
                self._story_bible = StoryBible.from_dict(sb)
            except Exception:
                self._story_bible = None

        wc = context.get("world_contract")
        if isinstance(wc, WorldStateContract):
            self._world_contract = wc
        elif isinstance(wc, dict):
            try:
                self._world_contract = WorldStateContract.from_dict(wc)
            except Exception:
                self._world_contract = None
        elif self._story_bible is not None and self._story_bible.world_contract is not None:
            self._world_contract = self._story_bible.world_contract

        cr = context.get("character_registry")
        if isinstance(cr, list):
            self._character_registry = [
                c if isinstance(c, OCCharacterSheet)
                else (OCCharacterSheet.from_dict(c) if isinstance(c, dict) else c)
                for c in cr
            ]
        elif self._story_bible is not None and self._story_bible.character_registry:
            self._character_registry = list(self._story_bible.character_registry.values())

        genre = self._infer_genre()
        if genre:
            world_rules = (
                self._world_contract.rules if self._world_contract is not None else []
            )
            self._rulebook = self.build_rulebook(genre, world_rules)
            self._state.custom["genre"] = genre
            self._state.custom["rulebook_built"] = True

        pc = self._story_bible.plot_compass if self._story_bible else None
        if pc is not None:
            self._campaign_arc = self.build_campaign_arc(pc)
            self._state.custom["campaign_arc_built"] = True

        self._persist()

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        if message.topic == TOPIC_CONTROL_MODULE_INIT:
            ctx = message.payload if isinstance(message.payload, dict) else {}
            self.init(ctx)
        elif message.topic == TOPIC_DATA_SANDBOX_WORLD_UPDATED:
            self._handle_world_updated(message.payload)
        elif message.topic == TOPIC_DATA_OC_EVOLVED:
            self._handle_oc_evolved(message.payload)
        elif message.topic == TOPIC_CONTROL_COC_SCENARIO_REQUEST:
            self._handle_scenario_request(message.payload)

    def tick(self, delta: TickDelta) -> None:
        self._state.last_tick = delta.absolute_time

    def get_state(self) -> dict[str, Any]:
        return {
            "active": self._state.active,
            "energy_cost": self._state.energy_cost,
            "last_tick": self._state.last_tick,
            "novel_id": self._novel_id,
            "genre": self._state.custom.get("genre", ""),
            "rulebook_built": self._rulebook is not None,
            "campaign_arc_built": self._campaign_arc is not None,
            "scenario_count": len(self._scenarios),
        }

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update({
            "novel_id": self._novel_id,
            "state_path": self._state_path,
            "story_bible": self._story_bible.to_dict() if self._story_bible else None,
            "world_contract": (
                self._world_contract.to_dict() if self._world_contract else None
            ),
            "rulebook": self._rulebook.to_dict() if self._rulebook else None,
            "campaign_arc": self._campaign_arc,
            "scenarios": {
                str(k): self._serialize_scenario(v)
                for k, v in self._scenarios.items()
            },
        })
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._novel_id = data.get("novel_id", self._novel_id)
        self._state_path = data.get("state_path", self._state_path)
        sb_data = data.get("story_bible")
        if isinstance(sb_data, dict):
            try:
                self._story_bible = StoryBible.from_dict(sb_data)
            except Exception:
                self._story_bible = None
        wc_data = data.get("world_contract")
        if isinstance(wc_data, dict):
            try:
                self._world_contract = WorldStateContract.from_dict(wc_data)
            except Exception:
                self._world_contract = None
        rb_data = data.get("rulebook")
        if isinstance(rb_data, dict):
            self._rulebook = Rulebook(rb_data)
        self._campaign_arc = data.get("campaign_arc")
        scenarios_data = data.get("scenarios") or {}
        self._scenarios = {
            int(k): self._deserialize_scenario(v)
            for k, v in scenarios_data.items()
            if isinstance(v, dict)
        }

    # ------------------------------------------------------------------
    # SubTask 3.1.2: build_rulebook
    # ------------------------------------------------------------------

    def build_rulebook(
        self,
        genre: str,
        world_rules: list[WorldRule] | None = None,
    ) -> Rulebook:
        """题材驱动 Rulebook 定制（5 个分支 + 默认 fallback）。"""
        canonical = _match_genre(genre)
        builder = _GENRE_RULEBOOK_BUILDERS.get(canonical, _build_default_rulebook)
        data = builder(world_rules or [])
        data.setdefault("metadata", {})
        data["metadata"]["source_genre"] = genre
        data["metadata"]["canonical_genre"] = canonical
        rulebook = Rulebook(data)
        self._rulebook = rulebook
        self._state.custom["genre"] = genre
        self._state.custom["rulebook_built"] = True
        self._persist()
        return rulebook

    # ------------------------------------------------------------------
    # SubTask 3.1.3: build_campaign_arc
    # ------------------------------------------------------------------

    def build_campaign_arc(self, plot_compass: PlotCompass) -> dict[str, Any]:
        """5 阶段 Campaign Arc 模板。"""
        scale = (
            plot_compass.scale
            if plot_compass.scale in _SCALE_CHAPTERS
            else "medium"
        )
        total, ratios = _SCALE_CHAPTERS[scale]
        climax_intensity = _ending_intent_to_climax_intensity(
            plot_compass.ending_intent
        )

        stages: list[dict[str, Any]] = []
        for (phase, name_zh, summary), ratio in zip(_CAMPAIGN_STAGES, ratios):
            target_chapters = max(1, int(round(ratio * total)))
            if phase == "climax":
                intensity = climax_intensity
            elif phase == "turning_point":
                intensity = min(1.0, climax_intensity * 0.85)
            elif phase == "falling_action":
                intensity = max(0.1, climax_intensity * 0.5)
            elif phase == "rising_action":
                intensity = 0.55
            else:  # introduction
                intensity = 0.35
            stages.append({
                "name": name_zh,
                "phase": phase,
                "target_chapters": target_chapters,
                "intensity": round(intensity, 3),
                "summary": summary,
            })

        # 把四舍五入的差额补到 climax，保证各阶段章节总数 == total
        allocated = sum(s["target_chapters"] for s in stages)
        if allocated != total and stages:
            diff = total - allocated
            stages[3]["target_chapters"] = max(
                1, stages[3]["target_chapters"] + diff
            )

        arc = {
            "scale": scale,
            "total_chapters": total,
            "ending_intent": plot_compass.ending_intent,
            "climax_intensity": round(climax_intensity, 3),
            "active_long_arcs": list(plot_compass.active_long_arcs),
            "stages": stages,
        }
        self._campaign_arc = arc
        self._state.custom["campaign_arc_built"] = True
        self._persist()
        return arc

    # ------------------------------------------------------------------
    # SubTask 3.1.4: build_chapter_scenario
    # ------------------------------------------------------------------

    def build_chapter_scenario(
        self,
        chapter_index: int,
        campaign_arc: dict[str, Any] | None = None,
        world_contract: WorldStateContract | None = None,
        character_registry: list[OCCharacterSheet] | None = None,
        chapter_intent: ChapterIntent | None = None,
    ) -> dict[str, Any]:
        """生成章节场景并发布 ``control.sandbox.scenario.load``。"""
        arc = campaign_arc if campaign_arc is not None else self._campaign_arc
        wc = (
            world_contract
            if world_contract is not None
            else self._world_contract
        )
        cr = (
            character_registry
            if character_registry is not None
            else self._character_registry
        )

        campaign_phase = self._phase_for_chapter(chapter_index, arc)
        objective = self._objective_for_phase(campaign_phase, chapter_intent)
        key_npcs = self._pick_key_npcs(cr, chapter_intent, min_n=2, max_n=5)
        location = self._pick_location(wc, chapter_intent)
        conflict = self._conflict_for_phase(campaign_phase, chapter_intent, wc)
        possible_checks = self._possible_checks_for_phase(
            campaign_phase, chapter_intent
        )

        scenario_id = (
            f"scenario_{self._novel_id}_ch{chapter_index}_{uuid.uuid4().hex[:6]}"
        )
        scenario: dict[str, Any] = {
            "scenario_id": scenario_id,
            "chapter_index": chapter_index,
            "campaign_phase": campaign_phase,
            "objective": objective,
            "key_npcs": key_npcs,  # list[OCCharacterSheet] 满足任务字面要求
            "location": location,
            "conflict": conflict,
            "possible_checks": possible_checks,
        }
        self._scenarios[chapter_index] = scenario
        self._state.custom["scenario_count"] = len(self._scenarios)
        self._persist()

        # 发布事件时使用 JSON-safe 的副本（OCCharacterSheet → dict）
        payload = self._serialize_scenario(scenario)
        payload["chapter_index"] = chapter_index
        payload["scenario_id"] = scenario_id
        self._emit_safe(
            TOPIC_CONTROL_SANDBOX_SCENARIO_LOAD,
            payload,
            channel="control",
        )
        return scenario

    # ------------------------------------------------------------------
    # Bus 消息处理
    # ------------------------------------------------------------------

    def _handle_world_updated(self, payload: Any) -> None:
        if not isinstance(payload, dict):
            return
        wc_data = payload.get("world_contract")
        if isinstance(wc_data, WorldStateContract):
            self._world_contract = wc_data
        elif isinstance(wc_data, dict):
            try:
                self._world_contract = WorldStateContract.from_dict(wc_data)
            except Exception:
                pass
        if self._world_contract is not None:
            genre = self._infer_genre()
            if genre:
                self._rulebook = self.build_rulebook(
                    genre, self._world_contract.rules
                )

    def _handle_oc_evolved(self, payload: Any) -> None:
        if isinstance(payload, OCCharacterSheet):
            self._upsert_character(payload)
            return
        if not isinstance(payload, dict):
            return
        sheet_data = payload.get("sheet")
        if isinstance(sheet_data, OCCharacterSheet):
            self._upsert_character(sheet_data)
        elif isinstance(sheet_data, dict):
            try:
                self._upsert_character(OCCharacterSheet.from_dict(sheet_data))
            except Exception:
                pass
        elif isinstance(sheet_data, list):
            for item in sheet_data:
                if isinstance(item, OCCharacterSheet):
                    self._upsert_character(item)
                elif isinstance(item, dict):
                    try:
                        self._upsert_character(OCCharacterSheet.from_dict(item))
                    except Exception:
                        pass

    def _handle_scenario_request(self, payload: Any) -> None:
        if not isinstance(payload, dict):
            return
        chapter_index = payload.get("chapter_index")
        if chapter_index is None:
            return
        try:
            chapter_index = int(chapter_index)
        except (TypeError, ValueError):
            return
        chapter_intent = payload.get("chapter_intent")
        if isinstance(chapter_intent, dict):
            try:
                chapter_intent = ChapterIntent.from_dict(chapter_intent)
            except Exception:
                chapter_intent = None
        elif not isinstance(chapter_intent, ChapterIntent):
            chapter_intent = None
        self.build_chapter_scenario(
            chapter_index=chapter_index,
            campaign_arc=payload.get("campaign_arc") or self._campaign_arc,
            world_contract=payload.get("world_contract") or self._world_contract,
            character_registry=(
                payload.get("character_registry") or self._character_registry
            ),
            chapter_intent=chapter_intent,
        )

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------

    def _infer_genre(self) -> str:
        if self._story_bible is not None and self._story_bible.genre:
            return self._story_bible.genre
        if self._world_contract is not None and self._world_contract.genre:
            return self._world_contract.genre
        return ""

    def _upsert_character(self, sheet: OCCharacterSheet) -> None:
        for i, existing in enumerate(self._character_registry):
            if existing.character_id == sheet.character_id:
                self._character_registry[i] = sheet
                return
        self._character_registry.append(sheet)

    def _phase_for_chapter(
        self, chapter_index: int, arc: dict[str, Any] | None
    ) -> str:
        if not arc or "stages" not in arc:
            return "introduction"
        stages = arc["stages"]
        cumulative = 0
        for stage in stages:
            cumulative += int(stage.get("target_chapters", 0))
            if chapter_index <= cumulative:
                return stage.get("phase", "introduction")
        return stages[-1].get("phase", "falling_action") if stages else "introduction"

    def _objective_for_phase(
        self, phase: str, chapter_intent: ChapterIntent | None
    ) -> str:
        if chapter_intent is not None and chapter_intent.narrative_beats:
            return "；".join(chapter_intent.narrative_beats[:2])
        return _PHASE_OBJECTIVES.get(phase, "推进剧情。")

    def _pick_key_npcs(
        self,
        registry: list[OCCharacterSheet] | None,
        chapter_intent: ChapterIntent | None,
        *,
        min_n: int = 2,
        max_n: int = 5,
    ) -> list[OCCharacterSheet]:
        if not registry:
            return []
        required: set[str] = set()
        if chapter_intent is not None and chapter_intent.required_characters:
            required = set(chapter_intent.required_characters)

        selected: list[OCCharacterSheet] = []
        if required:
            for sheet in registry:
                if sheet.character_id in required or sheet.name in required:
                    selected.append(sheet)
                    if len(selected) >= max_n:
                        return selected[:max_n]

        # 按 role 优先级补足：protagonist > antagonist > supporting > walk-on
        role_priority = ("protagonist", "antagonist", "supporting", "walk-on")
        for role in role_priority:
            for sheet in registry:
                if sheet in selected:
                    continue
                if sheet.role_in_story == role:
                    selected.append(sheet)
                    if len(selected) >= max_n:
                        return selected[:max_n]

        # 仍未满，取剩余任意
        for sheet in registry:
            if sheet in selected:
                continue
            selected.append(sheet)
            if len(selected) >= max_n:
                break

        result = selected[:max_n]
        # 注册表足够大时，至少返回 min_n 个
        if len(result) < min_n and len(registry) >= min_n:
            for sheet in registry:
                if sheet in result:
                    continue
                result.append(sheet)
                if len(result) >= min_n:
                    break
        return result

    def _pick_location(
        self,
        world_contract: WorldStateContract | None,
        chapter_intent: ChapterIntent | None,
    ) -> dict[str, Any]:
        if (
            chapter_intent is not None
            and chapter_intent.required_settings
            and world_contract is not None
        ):
            geo = world_contract.geography or {}
            for setting in chapter_intent.required_settings:
                if setting in geo:
                    return {"name": setting, "details": geo[setting]}
                for key, value in geo.items():
                    if setting in key or (
                        isinstance(value, dict) and setting in str(value)
                    ):
                        return {"name": key, "details": value}
        if world_contract is not None and world_contract.geography:
            first_key = next(iter(world_contract.geography))
            return {
                "name": first_key,
                "details": world_contract.geography[first_key],
            }
        return {"name": "未指定", "details": {}}

    def _conflict_for_phase(
        self,
        phase: str,
        chapter_intent: ChapterIntent | None,
        world_contract: WorldStateContract | None,
    ) -> str:
        if chapter_intent is not None and chapter_intent.narrative_beats:
            return "；".join(chapter_intent.narrative_beats)
        base = _PHASE_CONFLICTS.get(phase, "角色面临抉择。")
        if world_contract is not None and world_contract.forbidden:
            first = world_contract.forbidden[0]
            forbidden_name = getattr(first, "name", "") or str(first)
            if forbidden_name:
                return f"{base}（涉及禁忌：{forbidden_name}）"
        return base

    def _possible_checks_for_phase(
        self,
        phase: str,
        chapter_intent: ChapterIntent | None,
    ) -> list[dict[str, Any]]:
        scene_type = (
            chapter_intent.scene_type if chapter_intent is not None else ""
        )
        checks = list(_PHASE_CHECKS.get(phase, []))
        if scene_type == "action":
            checks.append({
                "skill": "格斗",
                "difficulty": 0.5,
                "purpose": "应对动作场景中的身体对抗",
            })
        elif scene_type == "dialogue":
            checks.append({
                "skill": "说服",
                "difficulty": 0.4,
                "purpose": "在对话中说服或识破对方",
            })
        elif scene_type == "psychological":
            checks.append({
                "skill": "心理学",
                "difficulty": 0.5,
                "purpose": "洞察自身或他人的心理状态",
            })
        elif scene_type == "environment":
            checks.append({
                "skill": "观察",
                "difficulty": 0.4,
                "purpose": "在环境场景中发现线索",
            })
        return checks

    def _serialize_scenario(self, scenario: dict[str, Any]) -> dict[str, Any]:
        """把 scenario 中的 OCCharacterSheet 转为 dict（用于事件/持久化）。"""
        out = dict(scenario)
        npcs = out.get("key_npcs") or []
        out["key_npcs"] = [
            n.to_dict() if isinstance(n, OCCharacterSheet) else n
            for n in npcs
        ]
        return out

    def _deserialize_scenario(self, data: dict[str, Any]) -> dict[str, Any]:
        """从 dict 恢复 scenario 中的 OCCharacterSheet（best-effort）。"""
        out = dict(data)
        npcs = out.get("key_npcs") or []
        restored: list[OCCharacterSheet] = []
        for n in npcs:
            if isinstance(n, OCCharacterSheet):
                restored.append(n)
            elif isinstance(n, dict):
                try:
                    restored.append(OCCharacterSheet.from_dict(n))
                except Exception:
                    pass
        if restored:
            out["key_npcs"] = restored
        return out

    def _emit_safe(
        self, topic: str, payload: Any, channel: str = "event"
    ) -> None:
        """仅在已注册 router 时 emit，否则 no-op（便于测试脱机调用）。"""
        if self._router is None:
            return
        try:
            self.emit(topic, payload, channel=channel)
        except RuntimeError:
            pass

    def _persist(self) -> None:
        try:
            PersistenceManager.save_atomic(self.to_dict(), self._state_path)
        except Exception:
            # 持久化失败不应中断引擎主流程
            pass


# ---------------------------------------------------------------------------
# 题材 Rulebook 构造器 (SubTask 3.1.2)
# ---------------------------------------------------------------------------


def _rulebook_data(
    *,
    name: str,
    skills: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    sanity: dict[str, Any] | None = None,
    combat: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    tomes: list[dict[str, Any]] | None = None,
    items: list[dict[str, Any]] | None = None,
    campaign_arcs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "name": name,
        "version": "1.0",
        "skills": skills,
        "actions": actions,
    }
    if sanity is not None:
        data["sanity"] = sanity
    if combat is not None:
        data["combat"] = combat
    if metadata:
        data["metadata"] = metadata
    if tomes:
        data["tomes"] = tomes
    if items:
        data["items"] = items
    if campaign_arcs:
        data["campaign_arcs"] = campaign_arcs
    return data


def _build_cthulhu_rulebook(world_rules: list[WorldRule]) -> dict[str, Any]:
    """克苏鲁/神秘：mythos_skills + sanity + forbidden/tomes。"""
    skills = [
        {"name": "克苏鲁神话", "base_value": 0.0, "attributes": ["int", "pow"], "description": "禁忌神话知识", "tags": ["mythos", "forbidden"]},
        {"name": "神秘学", "base_value": 5.0, "attributes": ["int"], "description": "对神秘传统的了解", "tags": ["mythos"]},
        {"name": "图书馆使用", "base_value": 20.0, "attributes": ["int", "edu"], "description": "查阅典籍与档案", "tags": ["research"]},
        {"name": "心理学", "base_value": 10.0, "attributes": ["int", "pow"], "description": "洞察他人心理", "tags": ["social"]},
        {"name": "观察", "base_value": 25.0, "attributes": ["int", "dex"], "description": "察觉细节", "tags": ["perception"]},
        {"name": "潜行", "base_value": 20.0, "attributes": ["dex"], "description": "悄声移动", "tags": ["stealth"]},
        {"name": "说服", "base_value": 10.0, "attributes": ["app", "pow"], "description": "说服他人", "tags": ["social"]},
        {"name": "理智检定", "base_value": 0.0, "attributes": ["pow"], "description": "对抗 SAN 损失", "tags": ["sanity"]},
    ]
    actions = [
        {"name": "翻阅禁书", "skill": "克苏鲁神话", "keywords": ["禁书", "tome", "翻阅", "研究"], "difficulty": 0.6, "default_modifier": -0.1},
        {"name": "调查现场", "skill": "观察", "keywords": ["调查", "搜索", "investigate"], "difficulty": 0.4, "default_modifier": 0.0},
        {"name": "询问证人", "skill": "说服", "keywords": ["询问", "问", "interrogate"], "difficulty": 0.4, "default_modifier": 0.0},
        {"name": "潜入", "skill": "潜行", "keywords": ["潜入", "sneak", "潜行"], "difficulty": 0.5, "default_modifier": 0.0},
        {"name": "理智检定", "skill": "理智检定", "keywords": ["恐惧", "san", "sanity", "惊吓"], "difficulty": 0.5, "default_modifier": 0.0},
    ]
    sanity = {
        "enabled": True,
        "fumble_shock_range": [5.0, 10.0],
        "fear_shock_threshold": 0.5,
        "fear_shock_probability": 0.3,
        "phobia_chance": 0.35,
        "indefinite_insanity_threshold": 0.0,
        "permanent_insanity_threshold": 0.0,
    }
    tomes = [
        {"id": "necronomicon", "name": "死灵之书", "mythos_rating": 8.0, "spells": ["召唤"], "sanity_cost_first_read": 1.0, "sanity_cost_study": 2.0, "cthulhu_mythos_bonus": 5.0},
    ]
    return _rulebook_data(
        name="克苏鲁神话规则书",
        skills=skills,
        actions=actions,
        sanity=sanity,
        tomes=tomes,
        metadata={"genre": "cthulhu", "forbidden_knowledge": True},
    )


def _build_urban_rulebook(world_rules: list[WorldRule]) -> dict[str, Any]:
    """都市/现实：social_skills + reputation。"""
    skills = [
        {"name": "说服", "base_value": 15.0, "attributes": ["app", "pow"], "description": "日常说服", "tags": ["social"]},
        {"name": "心理学", "base_value": 15.0, "attributes": ["int", "pow"], "description": "读懂他人", "tags": ["social"]},
        {"name": "信誉", "base_value": 30.0, "attributes": ["app", "edu"], "description": "社会声誉资源", "tags": ["social", "reputation"]},
        {"name": "街头智慧", "base_value": 20.0, "attributes": ["int", "dex"], "description": "都市生存直觉", "tags": ["urban"]},
        {"name": "电脑使用", "base_value": 20.0, "attributes": ["int", "dex"], "description": "数字信息检索", "tags": ["modern"]},
        {"name": "驾驶", "base_value": 25.0, "attributes": ["dex"], "description": "现代交通", "tags": ["modern"]},
        {"name": "观察", "base_value": 25.0, "attributes": ["int", "dex"], "description": "察觉细节", "tags": ["perception"]},
        {"name": "格斗", "base_value": 30.0, "attributes": ["str", "dex"], "description": "近身防卫", "tags": ["combat"]},
    ]
    actions = [
        {"name": "打听消息", "skill": "信誉", "keywords": ["打听", "情报", "ask around"], "difficulty": 0.4, "default_modifier": 0.0},
        {"name": "网络调查", "skill": "电脑使用", "keywords": ["搜索", "上网", "google"], "difficulty": 0.4, "default_modifier": 0.0},
        {"name": "周旋", "skill": "说服", "keywords": ["周旋", "谈判", "negotiate"], "difficulty": 0.5, "default_modifier": 0.0},
        {"name": "甩掉跟踪", "skill": "驾驶", "keywords": ["甩", "车", "driving"], "difficulty": 0.5, "default_modifier": 0.0},
    ]
    sanity = {
        "enabled": False,
        "fumble_shock_range": [0.0, 0.0],
        "fear_shock_threshold": 0.0,
        "fear_shock_probability": 0.0,
        "phobia_chance": 0.0,
        "indefinite_insanity_threshold": 0.0,
        "permanent_insanity_threshold": 0.0,
    }
    return _rulebook_data(
        name="都市现实规则书",
        skills=skills,
        actions=actions,
        sanity=sanity,
        metadata={"genre": "urban", "reputation_system": True},
    )


def _build_ancient_rulebook(world_rules: list[WorldRule]) -> dict[str, Any]:
    """古代/历史：martial_skills + period_actions。"""
    skills = [
        {"name": "剑术", "base_value": 25.0, "attributes": ["str", "dex"], "description": "刀剑武艺", "tags": ["martial", "weapon"]},
        {"name": "拳脚", "base_value": 30.0, "attributes": ["str", "con"], "description": "徒手格斗", "tags": ["martial"]},
        {"name": "轻功", "base_value": 15.0, "attributes": ["dex", "con"], "description": "身法移动", "tags": ["martial", "movement"]},
        {"name": "内功", "base_value": 10.0, "attributes": ["con", "pow"], "description": "内家修为", "tags": ["martial", "internal"]},
        {"name": "医术", "base_value": 15.0, "attributes": ["int", "edu"], "description": "诊脉开方", "tags": ["period", "scholar"]},
        {"name": "礼仪", "base_value": 25.0, "attributes": ["app", "edu"], "description": "礼数规矩", "tags": ["period", "social"]},
        {"name": "察觉", "base_value": 25.0, "attributes": ["int", "dex"], "description": "眼观六路", "tags": ["perception"]},
        {"name": "说服", "base_value": 15.0, "attributes": ["app", "pow"], "description": "游说劝诱", "tags": ["social"]},
    ]
    actions = [
        {"name": "比武", "skill": "剑术", "keywords": ["比武", "决斗", "duel"], "difficulty": 0.6, "default_modifier": 0.0},
        {"name": "运功", "skill": "轻功", "keywords": ["运功", "飞", "leap"], "difficulty": 0.5, "default_modifier": 0.0},
        {"name": "疗伤", "skill": "医术", "keywords": ["疗伤", "诊脉", "heal"], "difficulty": 0.5, "default_modifier": 0.0},
        {"name": "拜帖", "skill": "礼仪", "keywords": ["拜帖", "拜会", "visit"], "difficulty": 0.3, "default_modifier": 0.0},
    ]
    sanity = {
        "enabled": False,
        "fumble_shock_range": [0.0, 0.0],
        "fear_shock_threshold": 0.0,
        "fear_shock_probability": 0.0,
        "phobia_chance": 0.0,
        "indefinite_insanity_threshold": 0.0,
        "permanent_insanity_threshold": 0.0,
    }
    return _rulebook_data(
        name="古代历史规则书",
        skills=skills,
        actions=actions,
        sanity=sanity,
        metadata={"genre": "ancient", "martial_arts": True},
    )


def _build_scifi_rulebook(world_rules: list[WorldRule]) -> dict[str, Any]:
    """科幻/未来：tech_skills。"""
    skills = [
        {"name": "电子学", "base_value": 15.0, "attributes": ["int", "dex"], "description": "电子设备操作维修", "tags": ["tech"]},
        {"name": "机械维修", "base_value": 20.0, "attributes": ["int", "dex"], "description": "机械设备维护", "tags": ["tech"]},
        {"name": "电脑使用", "base_value": 25.0, "attributes": ["int"], "description": "数字系统交互", "tags": ["tech"]},
        {"name": "黑客", "base_value": 5.0, "attributes": ["int"], "description": "突破信息系统", "tags": ["tech", "illegal"]},
        {"name": "驾驶", "base_value": 25.0, "attributes": ["dex"], "description": "操作载具", "tags": ["tech"]},
        {"name": "射击", "base_value": 25.0, "attributes": ["dex"], "description": "能量/动能武器", "tags": ["combat"]},
        {"name": "外星生物学", "base_value": 5.0, "attributes": ["int", "edu"], "description": "异种生命识别", "tags": ["science"]},
        {"name": "观察", "base_value": 25.0, "attributes": ["int", "dex"], "description": "察觉异常", "tags": ["perception"]},
    ]
    actions = [
        {"name": "骇入", "skill": "黑客", "keywords": ["骇入", "hack", "入侵"], "difficulty": 0.6, "default_modifier": -0.1},
        {"name": "维修", "skill": "机械维修", "keywords": ["维修", "fix", "repair"], "difficulty": 0.4, "default_modifier": 0.0},
        {"name": "扫描", "skill": "电子学", "keywords": ["扫描", "scan", "探测"], "difficulty": 0.4, "default_modifier": 0.0},
        {"name": "驾驶飞船", "skill": "驾驶", "keywords": ["驾驶", "飞船", "pilot"], "difficulty": 0.5, "default_modifier": 0.0},
    ]
    sanity = {
        "enabled": False,
        "fumble_shock_range": [0.0, 0.0],
        "fear_shock_threshold": 0.0,
        "fear_shock_probability": 0.0,
        "phobia_chance": 0.0,
        "indefinite_insanity_threshold": 0.0,
        "permanent_insanity_threshold": 0.0,
    }
    return _rulebook_data(
        name="科幻未来规则书",
        skills=skills,
        actions=actions,
        sanity=sanity,
        metadata={"genre": "scifi", "tech_focus": True},
    )


def _build_magic_rulebook(world_rules: list[WorldRule]) -> dict[str, Any]:
    """奇幻/魔法：magic_skills + mana。"""
    skills = [
        {"name": "魔法", "base_value": 10.0, "attributes": ["pow", "int"], "description": "施法能力", "tags": ["magic"]},
        {"name": "法术辨识", "base_value": 15.0, "attributes": ["int", "edu"], "description": "辨认法术与魔法现象", "tags": ["magic", "knowledge"]},
        {"name": "炼金术", "base_value": 10.0, "attributes": ["int", "edu"], "description": "药剂调配", "tags": ["magic", "craft"]},
        {"name": "神秘学", "base_value": 15.0, "attributes": ["int"], "description": "古老传说与符文", "tags": ["knowledge"]},
        {"name": "剑术", "base_value": 25.0, "attributes": ["str", "dex"], "description": "近战武艺", "tags": ["combat"]},
        {"name": "野外生存", "base_value": 20.0, "attributes": ["con", "int"], "description": "荒野求生", "tags": ["survival"]},
        {"name": "观察", "base_value": 25.0, "attributes": ["int", "dex"], "description": "察觉异象", "tags": ["perception"]},
        {"name": "说服", "base_value": 15.0, "attributes": ["app", "pow"], "description": "外交交涉", "tags": ["social"]},
    ]
    actions = [
        {"name": "施法", "skill": "魔法", "keywords": ["施法", "cast", "咒语"], "difficulty": 0.6, "default_modifier": -0.1},
        {"name": "辨识法阵", "skill": "法术辨识", "keywords": ["辨识", "符文", "rune"], "difficulty": 0.5, "default_modifier": 0.0},
        {"name": "调配药剂", "skill": "炼金术", "keywords": ["调配", "药剂", "potion"], "difficulty": 0.5, "default_modifier": 0.0},
        {"name": "野外行军", "skill": "野外生存", "keywords": ["行军", "野外", "travel"], "difficulty": 0.4, "default_modifier": 0.0},
    ]
    sanity = {
        "enabled": False,
        "fumble_shock_range": [0.0, 0.0],
        "fear_shock_threshold": 0.0,
        "fear_shock_probability": 0.0,
        "phobia_chance": 0.0,
        "indefinite_insanity_threshold": 0.0,
        "permanent_insanity_threshold": 0.0,
    }
    return _rulebook_data(
        name="奇幻魔法规则书",
        skills=skills,
        actions=actions,
        sanity=sanity,
        metadata={"genre": "magic", "mana_system": True},
    )


def _build_default_rulebook(world_rules: list[WorldRule]) -> dict[str, Any]:
    """默认 fallback Rulebook（题材未识别时使用）。"""
    skills = [
        {"name": "观察", "base_value": 25.0, "attributes": ["int", "dex"], "description": "察觉细节", "tags": ["perception"]},
        {"name": "说服", "base_value": 15.0, "attributes": ["app", "pow"], "description": "说服他人", "tags": ["social"]},
        {"name": "潜行", "base_value": 20.0, "attributes": ["dex"], "description": "悄声移动", "tags": ["stealth"]},
        {"name": "格斗", "base_value": 30.0, "attributes": ["str", "dex"], "description": "近身战斗", "tags": ["combat"]},
        {"name": "闪避", "base_value": 20.0, "attributes": ["dex"], "description": "躲避攻击", "tags": ["combat"]},
        {"name": "图书馆使用", "base_value": 20.0, "attributes": ["int", "edu"], "description": "查阅资料", "tags": ["research"]},
        {"name": "心理学", "base_value": 10.0, "attributes": ["int", "pow"], "description": "洞察心理", "tags": ["social"]},
        {"name": "追踪", "base_value": 15.0, "attributes": ["int", "dex"], "description": "追循痕迹", "tags": ["perception"]},
    ]
    actions = [
        {"name": "调查", "skill": "观察", "keywords": ["调查", "investigate", "搜索"], "difficulty": 0.4, "default_modifier": 0.0},
        {"name": "交谈", "skill": "说服", "keywords": ["交谈", "talk", "询问"], "difficulty": 0.4, "default_modifier": 0.0},
        {"name": "潜行", "skill": "潜行", "keywords": ["潜行", "sneak"], "difficulty": 0.5, "default_modifier": 0.0},
        {"name": "战斗", "skill": "格斗", "keywords": ["战斗", "fight", "attack"], "difficulty": 0.6, "default_modifier": 0.0},
    ]
    sanity = {
        "enabled": False,
        "fumble_shock_range": [0.0, 0.0],
        "fear_shock_threshold": 0.0,
        "fear_shock_probability": 0.0,
        "phobia_chance": 0.0,
        "indefinite_insanity_threshold": 0.0,
        "permanent_insanity_threshold": 0.0,
    }
    return _rulebook_data(
        name="通用规则书",
        skills=skills,
        actions=actions,
        sanity=sanity,
        metadata={"genre": "default"},
    )


_GENRE_RULEBOOK_BUILDERS: dict[str, Callable[[list[WorldRule]], dict[str, Any]]] = {
    "cthulhu": _build_cthulhu_rulebook,
    "urban": _build_urban_rulebook,
    "ancient": _build_ancient_rulebook,
    "scifi": _build_scifi_rulebook,
    "magic": _build_magic_rulebook,
}
