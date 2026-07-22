"""Original-Character (OC) system managing the OC registry for a novel.

Per docs/系统重构方案_v1.md §6 the previous projection-based
``CharacterProjection`` is replaced by ``OCCharacterSheet`` instances. This
module owns the OC lifecycle: creation (with COC-style 3d6 rolls), updates
(with ``immutable_facts`` protection), world-fit checks, and persistence.

Topics (per ``topics.py`` REFACTOR_V2_TOPICS):

- Subscribes: ``data.memory.trace.query.result``, ``control.oc.create``,
  ``control.oc.update``, ``data.sandbox.world.updated``
- Publishes: ``data.oc.created``, ``data.oc.updated``,
  ``data.oc.update.rejected``, ``data.oc.evolved``
"""

from __future__ import annotations

import datetime
import json
import math
import os
import random
from typing import Any

from src.novelist_brain.models import (
    BusMessage,
    Desire,
    Fear,
    LuckPool,
    ModuleState,
    OCCharacterSheet,
    SanitySystem,
    TickDelta,
    TraitVector,
    WorldStateContract,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import PersistenceManager


# COC standard 8 attributes (per default.config.json
# trpg.character_sheet_template.attributes).
COC_ATTRIBUTES: tuple[str, ...] = (
    "str",
    "con",
    "dex",
    "int",
    "pow",
    "app",
    "edu",
    "siz",
)

# Fallback default COC skill names used when default.config.json is not
# available. The actual skill list is loaded from
# ``trpg.embedded_rulebook.skills`` in default.config.json at module
# construction time.
_DEFAULT_COC_SKILLS: tuple[str, ...] = (
    "观察",
    "潜行",
    "说服",
    "图书馆使用",
    "格斗",
    "闪避",
    "心理学",
    "追踪",
)

# Skills that should not appear in ancient/historical settings.
_MODERN_SKILLS: tuple[str, ...] = (
    "电脑使用",
    "驾驶",
    "摄影",
    "电子学",
    "机械维修",
    "黑客",
)

# Default skill point budget for a new OC. COC 7e uses ``edu*4 + 20*2`` for
# occupation skill points; we approximate with a flat 200 per the task spec
# so the result is deterministic and easy to reason about in tests.
_DEFAULT_SKILL_POINTS = 200

# Mapping of archetype keywords to the role_in_story they are usually
# associated with. Used by :meth:`OCCharacterSystem.check_world_fit` to
# flag inconsistent archetype/role combinations.
_ARCHETYPE_ROLE_HINTS: dict[str, str] = {
    "mentor": "supporting",
    "导师": "supporting",
    "ally": "supporting",
    "盟友": "supporting",
    "villain": "antagonist",
    "反派": "antagonist",
    "antagonist": "antagonist",
    "hero": "protagonist",
    "主角": "protagonist",
    "protagonist": "protagonist",
}

# Genre keyword groups used by :meth:`OCCharacterSystem.check_world_fit`.
_ANCIENT_GENRE_TOKENS = (
    "古代",
    "古风",
    "古代中国",
    "历史",
    "ancient",
    "historical",
)
_FUTURE_GENRE_TOKENS = (
    "未来",
    "科幻",
    "future",
    "sci-fi",
    "scifi",
    "cyberpunk",
)
_CTHULHU_GENRE_TOKENS = (
    "克苏鲁",
    "cthulhu",
    "cosmic",
    "lovecraft",
)


def _load_default_skill_names() -> list[str]:
    """Load the default COC skill names from ``default.config.json``.

    Searches a few candidate locations (cwd-relative, then module-relative)
    so the function works both when tests run from ``/workspace`` and when
    the module is imported from a different cwd. Returns the fallback
    list if the config file is missing or unreadable.
    """
    candidates = [
        "default.config.json",
        os.path.join(os.getcwd(), "default.config.json"),
        os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..",
            "..",
            "default.config.json",
        ),
    ]
    for path in candidates:
        try:
            with open(path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        skills = (
            cfg.get("trpg", {})
            .get("embedded_rulebook", {})
            .get("skills", [])
        )
        names = [
            s.get("name")
            for s in skills
            if isinstance(s, dict) and s.get("name")
        ]
        if names:
            return [str(n) for n in names]
    return list(_DEFAULT_COC_SKILLS)


# ----------------------------------------------------------------------
# Payload coercion helpers
# ----------------------------------------------------------------------


def _coerce_trait_vector(value: Any) -> TraitVector:
    """Coerce a payload dict (or existing TraitVector) into a TraitVector."""
    if isinstance(value, TraitVector):
        return value
    if isinstance(value, dict):
        try:
            return TraitVector(**value)
        except TypeError:
            # Filter to known fields if unknown keys were supplied.
            known = {
                k: v
                for k, v in value.items()
                if k
                in {
                    "openness",
                    "conscientiousness",
                    "extraversion",
                    "agreeableness",
                    "neuroticism",
                }
            }
            try:
                return TraitVector(**known)
            except TypeError:
                return TraitVector()
    return TraitVector()


def _coerce_desires(value: Any) -> list[Desire]:
    """Coerce a list of dicts/Desires into a ``list[Desire]``."""
    if not isinstance(value, list):
        return []
    out: list[Desire] = []
    for item in value:
        if isinstance(item, Desire):
            out.append(item)
            continue
        if not isinstance(item, dict):
            continue
        obj = item.get("object")
        if obj is None:
            continue
        try:
            out.append(
                Desire(
                    object=str(obj),
                    strength=float(item.get("strength", 0.5)),
                    urgency=float(item.get("urgency", 0.5)),
                )
            )
        except (TypeError, ValueError):
            continue
    return out


def _coerce_fears(value: Any) -> list[Fear]:
    """Coerce a list of dicts/Fears into a ``list[Fear]``."""
    if not isinstance(value, list):
        return []
    out: list[Fear] = []
    for item in value:
        if isinstance(item, Fear):
            out.append(item)
            continue
        if not isinstance(item, dict):
            continue
        obj = item.get("object")
        if obj is None:
            continue
        try:
            out.append(
                Fear(
                    object=str(obj),
                    intensity=float(item.get("intensity", 0.5)),
                    permanent=bool(item.get("permanent", False)),
                )
            )
        except (TypeError, ValueError):
            continue
    return out


# ----------------------------------------------------------------------
# OCCharacterSystem
# ----------------------------------------------------------------------


class OCCharacterSystem(Module):
    """Registry and lifecycle manager for OC characters in a single novel.

    State:
        - ``novel_id``: str
        - ``registry_path``: path to ``oc_registry/{novel_id}.json``
        - ``sheets``: ``dict[str, OCCharacterSheet]``
        - ``rng``: ``random.Random``
        - ``world_contract``: ``WorldStateContract | None`` (for world-fit checks)
    """

    def __init__(self, name: str = "oc_character_system") -> None:
        super().__init__(name)
        self._sheets: dict[str, OCCharacterSheet] = {}
        self._novel_id: str = ""
        self._registry_path: str = ""
        self._rng: random.Random = random.Random()
        self._world_contract: WorldStateContract | None = None
        self._llm: Any = None  # optional LLM for richer character generation
        self._default_skills: list[str] = _load_default_skill_names()
        # Subscribe to bus topics (SubTask 1.3.1)
        self.subscribe(
            "data.memory.trace.query.result",
            "control.oc.create",
            "control.oc.update",
            "data.sandbox.world.updated",  # to track world changes for re-validation
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "oc_character_system",
            "version": "0.1.0",
            "description": (
                "OC character registry with COC sheet generation and "
                "immutable_facts protection"
            ),
            "dependencies": [],
            "category": "novel_source",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.15,
            custom={
                "sheet_count": 0,
                "novel_id": "",
            },
        )

    # ------------------------------------------------------------------
    # Lifecycle (Module interface)
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        """Initialize from agent context.

        Expected context keys:

        - ``novel_v2``: ``{'novel_id': str, 'oc_registry_dir': str}``
        - ``world_contract``: ``WorldStateContract | dict | None``
        - ``rng_seed``: ``int | None``
        - ``llm``: ``LLMService | None``
        """
        novel_v2 = context.get("novel_v2", {}) or {}
        if not isinstance(novel_v2, dict):
            novel_v2 = {}
        self._novel_id = str(novel_v2.get("novel_id", "default") or "default")
        oc_dir = novel_v2.get("oc_registry_dir", "oc_registry") or "oc_registry"
        self._registry_path = os.path.join(oc_dir, f"{self._novel_id}.json")

        seed = context.get("rng_seed")
        if seed is not None:
            try:
                self._rng = random.Random(int(seed))
            except (TypeError, ValueError):
                pass

        self._llm = context.get("llm")
        wc = context.get("world_contract")
        if isinstance(wc, WorldStateContract):
            self._world_contract = wc
        elif isinstance(wc, dict):
            try:
                self._world_contract = WorldStateContract.from_dict(wc)
            except Exception:
                self._world_contract = None
        else:
            self._world_contract = None

        # Load existing registry if present (SubTask 1.3.6).
        self._load_registry()
        self._state.custom["novel_id"] = self._novel_id
        self._state.custom["sheet_count"] = len(self._sheets)

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        payload = message.payload
        if message.topic == "control.oc.create":
            self._handle_create(payload)
        elif message.topic == "control.oc.update":
            self._handle_update(payload)
        elif message.topic == "data.memory.trace.query.result":
            self._handle_trace_results(payload)
        elif message.topic == "data.sandbox.world.updated":
            self._handle_world_updated(payload)

    def tick(self, delta: TickDelta) -> None:
        self._state.last_tick = delta.absolute_time

    # ------------------------------------------------------------------
    # SubTask 1.3.2: build_oc_sheet()
    # ------------------------------------------------------------------

    def build_oc_sheet(
        self,
        *,
        character_id: str,
        name: str = "",
        archetype: str = "",
        role_in_story: str = "supporting",
        source_traces: list[str] | None = None,
        traits: TraitVector | None = None,
        values: list[str] | None = None,
        desires: list[Desire] | None = None,
        fears: list[Fear] | None = None,
        internal_conflict: str = "",
        immutable_facts: list[str] | None = None,
        skill_prior: dict[str, float] | None = None,
        skill_points: int = _DEFAULT_SKILL_POINTS,
    ) -> OCCharacterSheet:
        """Build a fully-initialized ``OCCharacterSheet`` with COC-style 3d6 rolls.

        Per COC rules:

        - 8 attributes (str/con/dex/int/pow/app/edu/siz) each = 3d6 × 5
          (range 15-90).
        - HP = floor((con + siz) / 10).
        - MP = floor(pow / 5).
        - Initial ``sanity.current_sanity`` = pow × 5 (capped at 99).
        - Luck = 3d6 × 5 (independent roll, capped at 99).

        ``skill_points`` (default 200) are distributed across ``skill_prior``
        if provided; otherwise the default COC skill list (loaded from
        ``default.config.json``) is used with equal weights. The remainder
        from integer division is distributed pseudo-randomly across the
        first few skills so the totals add up exactly.
        """
        # Roll 8 attributes (3d6 × 5 each).
        coc_attributes: dict[str, int] = {
            attr: self._roll_3d6_times_5() for attr in COC_ATTRIBUTES
        }

        # Derived stats.
        con = coc_attributes["con"]
        siz = coc_attributes["siz"]
        pow_ = coc_attributes["pow"]
        hp = math.floor((con + siz) / 10)
        mp = math.floor(pow_ / 5)
        san_current = min(pow_ * 5, 99)

        # Luck pool (independent 3d6 × 5 roll, capped at 99).
        luck_current = min(self._roll_3d6_times_5(), 99)
        luck = LuckPool(current=luck_current, max=99, spent_today=0)

        # SanitySystem uses ``current_sanity`` / ``max_sanity`` per models.py.
        sanity = SanitySystem(
            current_sanity=float(san_current),
            max_sanity=float(99),
        )

        # Skill distribution.
        coc_skills = self._distribute_skill_points(skill_prior, skill_points)

        sheet = OCCharacterSheet(
            character_id=character_id,
            name=name,
            archetype=archetype,
            role_in_story=role_in_story,  # type: ignore[arg-type]
            source_traces=list(source_traces or []),
            traits=traits or TraitVector(),
            values=list(values or []),
            desires=list(desires or []),
            fears=list(fears or []),
            internal_conflict=internal_conflict,
            coc_attributes=coc_attributes,
            coc_skills=coc_skills,
            sanity=sanity,
            luck=luck,
            hit_points=float(hp),
            magic_points=float(mp),
            immutable_facts=list(immutable_facts or []),
            projection_ratio=0.0,
        )
        return sheet

    def _roll_3d6_times_5(self) -> int:
        """Roll 3d6 and multiply by 5 (COC attribute generation)."""
        total = sum(self._rng.randint(1, 6) for _ in range(3))
        return total * 5

    def _distribute_skill_points(
        self,
        skill_prior: dict[str, float] | None,
        total_points: int,
    ) -> dict[str, float]:
        """Distribute ``total_points`` across skills.

        If ``skill_prior`` is provided (``skill_name → weight``), points are
        allocated proportionally to the prior weights. Otherwise the default
        COC skill list (loaded from ``default.config.json``) is used with
        equal weights. Remainder from integer floor division is distributed
        across the first few skills so totals add up exactly.
        """
        if skill_prior and isinstance(skill_prior, dict) and skill_prior:
            skills = list(skill_prior.keys())
            weights: list[float] = []
            for k in skills:
                try:
                    weights.append(max(0.0, float(skill_prior[k])))
                except (TypeError, ValueError):
                    weights.append(0.0)
        else:
            skills = list(self._default_skills) or list(_DEFAULT_COC_SKILLS)
            weights = [1.0] * len(skills)

        # Drop zero-weight skills to avoid divide-by-zero and useless entries.
        paired = [(s, w) for s, w in zip(skills, weights) if w > 0]
        if not paired:
            # Degenerate prior: fall back to equal split over default skills.
            skills = list(self._default_skills) or list(_DEFAULT_COC_SKILLS)
            if not skills:
                return {}
            equal = total_points / len(skills)
            return {s: float(equal) for s in skills}
        skills = [p[0] for p in paired]
        weights = [p[1] for p in paired]

        total_weight = sum(weights)
        if total_weight <= 0:
            equal = total_points / max(1, len(skills))
            return {s: float(equal) for s in skills}

        # Proportional allocation, floor to int, then distribute remainder.
        floor_points = [
            int((w / total_weight) * total_points) for w in weights
        ]
        distributed = sum(floor_points)
        remainder = max(0, total_points - distributed)

        allocated: dict[str, float] = {
            skills[i]: float(floor_points[i]) for i in range(len(skills))
        }
        # Distribute remainder one point at a time, round-robin, so totals
        # add up exactly to ``total_points``. The round-robin order is
        # deterministic given the input skill ordering; the rng is not used
        # here to keep distribution reproducible from the prior alone.
        idx = 0
        while remainder > 0 and skills:
            target = idx % len(skills)
            allocated[skills[target]] += 1.0
            remainder -= 1
            idx += 1
        return allocated

    # ------------------------------------------------------------------
    # SubTask 1.3.1: Bus handlers
    # ------------------------------------------------------------------

    def _handle_create(self, payload: Any) -> None:
        """Handle ``control.oc.create``: build a new OC sheet and publish ``data.oc.created``."""
        if not isinstance(payload, dict):
            return
        character_id = payload.get("character_id")
        if not character_id or not isinstance(character_id, str):
            return
        if character_id in self._sheets:
            # Already exists; emit reject.
            self._emit_reject(
                character_id,
                operation="create",
                reason="character already exists",
            )
            return

        # Convert payload sub-fields into dataclass instances.
        traits = _coerce_trait_vector(payload.get("traits"))
        desires = _coerce_desires(payload.get("desires"))
        fears = _coerce_fears(payload.get("fears"))

        source_traces = payload.get("source_traces")
        if not isinstance(source_traces, list):
            source_traces = []
        values = payload.get("values")
        if not isinstance(values, list):
            values = []
        immutable_facts = payload.get("immutable_facts")
        if not isinstance(immutable_facts, list):
            immutable_facts = []
        skill_prior = payload.get("skill_prior")
        if not isinstance(skill_prior, dict):
            skill_prior = None
        skill_points_raw = payload.get("skill_points", _DEFAULT_SKILL_POINTS)
        try:
            skill_points = int(skill_points_raw)
        except (TypeError, ValueError):
            skill_points = _DEFAULT_SKILL_POINTS

        role_in_story = str(
            payload.get("role_in_story", "supporting") or "supporting"
        )

        try:
            sheet = self.build_oc_sheet(
                character_id=character_id,
                name=str(payload.get("name", "") or ""),
                archetype=str(payload.get("archetype", "") or ""),
                role_in_story=role_in_story,
                source_traces=source_traces,
                traits=traits,
                values=values,
                desires=desires,
                fears=fears,
                internal_conflict=str(payload.get("internal_conflict", "") or ""),
                immutable_facts=immutable_facts,
                skill_prior=skill_prior,
                skill_points=skill_points,
            )
        except Exception as exc:
            self._emit_reject(
                character_id,
                operation="create",
                reason=f"build_oc_sheet failed: {exc}",
            )
            return

        # World-fit check (SubTask 1.3.3).
        warnings = self.check_world_fit(sheet)

        self._sheets[character_id] = sheet
        self._state.custom["sheet_count"] = len(self._sheets)
        self._save_registry()

        self._emit(
            topic="data.oc.created",
            payload={
                "character_id": character_id,
                "sheet": sheet.to_dict(),
                "world_fit_warnings": warnings,
            },
            channel="data",
        )

    def _handle_update(self, payload: Any) -> None:
        """Handle ``control.oc.update`` with ``immutable_facts`` protection.

        SubTask 1.3.4: fields listed in ``sheet.immutable_facts`` cannot be
        changed. If a payload attempts to change an immutable field, emit
        ``data.oc.update.rejected`` and skip the entire update.
        """
        if not isinstance(payload, dict):
            return
        character_id = payload.get("character_id")
        if not character_id or not isinstance(character_id, str):
            return
        if character_id not in self._sheets:
            self._emit_reject(
                character_id,
                operation="update",
                reason="character not found",
            )
            return

        sheet = self._sheets[character_id]
        updates = payload.get("updates")
        if not isinstance(updates, dict) or not updates:
            self._emit_reject(
                character_id,
                operation="update",
                reason="no updates provided or updates is not a dict",
            )
            return

        # Check for immutable_facts violations. ``immutable_facts`` is a
        # list of field names that are locked from further modification.
        violations = [
            field_name
            for field_name in updates
            if isinstance(field_name, str) and field_name in sheet.immutable_facts
        ]

        if violations:
            self._emit_reject(
                character_id,
                operation="update",
                reason="attempted to modify immutable_facts",
                violations=violations,
            )
            return

        # Apply updates (skip private fields and immutable_facts itself).
        applied: dict[str, Any] = {}
        for field_name, value in updates.items():
            if not isinstance(field_name, str):
                continue
            if field_name.startswith("_"):
                continue
            if field_name == "immutable_facts":
                # Changing the lock list itself is not allowed via update.
                continue
            if not hasattr(sheet, field_name):
                continue
            try:
                setattr(sheet, field_name, value)
                applied[field_name] = value
            except Exception:
                # Skip fields that fail validation on assignment.
                continue

        self._save_registry()
        self._emit(
            topic="data.oc.updated",
            payload={
                "character_id": character_id,
                "updates": applied,
                "sheet": sheet.to_dict(),
            },
            channel="data",
        )

    def _handle_trace_results(self, payload: Any) -> None:
        """When memory traces arrive, evolve OC characters if relevant.

        If a trace references an OC character (via ``character_id``), the OC
        may gain improvement marks for a skill. Emits ``data.oc.evolved``
        for each affected character.
        """
        if not isinstance(payload, dict):
            return
        traces = payload.get("traces")
        if not isinstance(traces, list):
            # Some senders use 'results' instead of 'traces'.
            traces = payload.get("results")
            if not isinstance(traces, list):
                return
        evolved_any = False
        for trace in traces:
            if not isinstance(trace, dict):
                continue
            character_id = trace.get("character_id")
            if not character_id or character_id not in self._sheets:
                continue
            sheet = self._sheets[character_id]
            skill_name = trace.get("skill")
            if skill_name and isinstance(skill_name, str):
                sheet.improvement_marks[skill_name] = (
                    sheet.improvement_marks.get(skill_name, 0) + 1
                )
            evolved_any = True
            self._emit(
                topic="data.oc.evolved",
                payload={
                    "character_id": character_id,
                    "evolution": "improvement_mark",
                    "skill": skill_name,
                    "source_trace": trace.get("id") or trace.get("trace_id"),
                },
                channel="data",
            )
        if evolved_any:
            self._save_registry()

    def _handle_world_updated(self, payload: Any) -> None:
        """When the world contract changes, re-validate all OCs and emit warnings."""
        if not isinstance(payload, dict):
            return
        contract_data = payload.get("world_contract")
        if contract_data is not None:
            if isinstance(contract_data, WorldStateContract):
                self._world_contract = contract_data
            elif isinstance(contract_data, dict):
                try:
                    self._world_contract = WorldStateContract.from_dict(
                        contract_data
                    )
                except Exception:
                    pass
        for cid, sheet in list(self._sheets.items()):
            warnings = self.check_world_fit(sheet)
            if warnings:
                self._emit(
                    topic="data.oc.evolved",
                    payload={
                        "character_id": cid,
                        "evolution": "world_fit_warning",
                        "warnings": warnings,
                    },
                    channel="data",
                )

    # ------------------------------------------------------------------
    # SubTask 1.3.3: World-fit check
    # ------------------------------------------------------------------

    def check_world_fit(self, sheet: OCCharacterSheet) -> list[str]:
        """Check if the OC sheet fits the current ``WorldStateContract``.

        Detects anachronisms (e.g., a modern skill in an ancient setting),
        missing expected skills in a sci-fi setting, fragile sanity for
        Cthulhu settings, and archetype/role_in_story mismatches. Returns a
        list of human-readable warnings (empty list = OK). If no
        ``world_contract`` is set, returns an empty list.
        """
        warnings: list[str] = []
        if self._world_contract is None:
            return warnings

        genre = (self._world_contract.genre or "").lower()
        skills = sheet.coc_skills or {}

        # 1. Ancient / historical setting: flag modern skills.
        if any(token in genre for token in _ANCIENT_GENRE_TOKENS):
            for skill_name in _MODERN_SKILLS:
                if skill_name in skills and float(skills[skill_name]) > 0:
                    warnings.append(
                        f"时代错位：'{skill_name}' 不应出现在古代/历史背景"
                        f"（genre={self._world_contract.genre}）"
                    )

        # 2. Future / sci-fi setting: expect '电脑使用' to be present.
        if any(token in genre for token in _FUTURE_GENRE_TOKENS):
            if "电脑使用" not in skills or float(skills.get("电脑使用", 0)) <= 0:
                warnings.append(
                    f"题材适配：科幻/未来背景应包含 '电脑使用' 技能"
                    f"（genre={self._world_contract.genre}）"
                )

        # 3. Cthulhu setting: characters should start with sanity < 50 to
        # reflect the genre's psychological fragility.
        if any(token in genre for token in _CTHULHU_GENRE_TOKENS):
            san = float(getattr(sheet.sanity, "current_sanity", 0.0))
            if san >= 50:
                warnings.append(
                    f"克苏鲁题材建议初始 sanity < 50（当前 {san}，"
                    f"genre={self._world_contract.genre}）"
                )

        # 4. Archetype / role_in_story consistency check.
        archetype_key = (sheet.archetype or "").lower()
        expected_role = _ARCHETYPE_ROLE_HINTS.get(archetype_key)
        if expected_role is not None and sheet.role_in_story != expected_role:
            warnings.append(
                f"角色定位不一致：archetype='{sheet.archetype}' 通常对应 "
                f"role_in_story='{expected_role}'，但当前为 "
                f"'{sheet.role_in_story}'"
            )

        return warnings

    # ------------------------------------------------------------------
    # SubTask 1.3.5: Query interfaces
    # ------------------------------------------------------------------

    def get_sheet(self, character_id: str) -> OCCharacterSheet | None:
        """Return the OC sheet for ``character_id``, or ``None`` if not found."""
        return self._sheets.get(character_id)

    def query_by_archetype(self, archetype: str) -> list[OCCharacterSheet]:
        """Return all OCs matching the given archetype (exact match)."""
        return [s for s in self._sheets.values() if s.archetype == archetype]

    def query_by_relationship(
        self,
        target_character_id: str,
        relationship_type: str | None = None,
    ) -> list[OCCharacterSheet]:
        """Return all OCs that have a relationship entry to ``target_character_id``.

        If ``relationship_type`` is provided, filter to that
        :class:`Relationship.type`.
        """
        result: list[OCCharacterSheet] = []
        for sheet in self._sheets.values():
            rel = sheet.relationships.get(target_character_id)
            if rel is None:
                continue
            if (
                relationship_type is None
                or getattr(rel, "type", None) == relationship_type
            ):
                result.append(sheet)
        return result

    # ------------------------------------------------------------------
    # SubTask 1.3.6: Persistence
    # ------------------------------------------------------------------

    def _load_registry(self) -> None:
        """Load OC registry from disk if it exists."""
        if not self._registry_path or not os.path.isfile(self._registry_path):
            return
        try:
            with open(self._registry_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            # Corrupt or unreadable registry; start fresh.
            self._sheets = {}
            return
        if not isinstance(data, dict):
            self._sheets = {}
            return
        sheets_data = data.get("sheets", {})
        if not isinstance(sheets_data, dict):
            self._sheets = {}
            return
        self._sheets = {}
        for cid, sd in sheets_data.items():
            if not isinstance(sd, dict):
                continue
            try:
                self._sheets[cid] = OCCharacterSheet.from_dict(sd)
            except Exception:
                # Skip a single corrupt sheet rather than aborting the whole load.
                continue

    def _save_registry(self) -> None:
        """Persist OC registry to disk atomically (SubTask 1.3.6)."""
        if not self._registry_path:
            return
        data = {
            "novel_id": self._novel_id,
            "saved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "sheets": {cid: sheet.to_dict() for cid, sheet in self._sheets.items()},
        }
        PersistenceManager.save_atomic(data, self._registry_path)

    # ------------------------------------------------------------------
    # Emit helpers
    # ------------------------------------------------------------------

    def _emit(self, *, topic: str, payload: Any, channel: str = "event") -> None:
        """Emit a bus message if a router is attached, else no-op.

        Using a helper keeps the call sites short and avoids spurious
        ``RuntimeError`` when the module is exercised in isolation
        (no router attached).
        """
        if self._router is None:
            return
        self.emit(topic=topic, payload=payload, channel=channel)

    def _emit_reject(
        self,
        character_id: str,
        *,
        operation: str,
        reason: str,
        violations: list[str] | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "character_id": character_id,
            "operation": operation,
            "reason": reason,
        }
        if violations is not None:
            payload["violations"] = violations
        self._emit(
            topic="data.oc.update.rejected",
            payload=payload,
            channel="data",
        )

    # ------------------------------------------------------------------
    # to_dict / from_dict for module state
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "novel_id": self._novel_id,
                "registry_path": self._registry_path,
                "sheets": {
                    cid: sheet.to_dict() for cid, sheet in self._sheets.items()
                },
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._novel_id = data.get("novel_id", "")
        self._registry_path = data.get("registry_path", "")
        sheets_data = data.get("sheets", {})
        if not isinstance(sheets_data, dict):
            sheets_data = {}
        self._sheets = {}
        for cid, sd in sheets_data.items():
            if not isinstance(sd, dict):
                continue
            try:
                self._sheets[cid] = OCCharacterSheet.from_dict(sd)
            except Exception:
                continue
        self._state.custom["sheet_count"] = len(self._sheets)
        self._state.custom["novel_id"] = self._novel_id
