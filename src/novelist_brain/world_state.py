"""WorldStateContract persistence, versioning and evolution.

This module implements the dynamic world layer of the refactored novelist
brain. It owns the lifecycle of a :class:`WorldStateContract`: loading from
disk, writing versioned snapshots, projecting a human-readable summary, and
evolving the contract as new experience data arrives.

Per docs/系统重构方案_v1.md §5 the previous hardcoded
``WorldModel(name="default", ontology={...})`` is replaced by a
WorldStateContract that grows with 林逸's experience data.
"""

from __future__ import annotations

import copy
import datetime
import json
import os
import re
from typing import Any

from src.novelist_brain.models import (
    WorldStateContract,
    WorldRule,
    Mystery,
    HistoricalEvent,
    Faction,
    Forbidden,
)
from src.novelist_brain.persistence import (
    AgentStateEncoder,
    dataclass_to_dict,
    reconstruct_dataclass,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Tags in a memory trace that signal a new geography entry should be added.
_PLACE_TAGS = {
    "新地点", "地点", "场景", "空间", "便利店", "旧书店", "书店",
    "咖啡馆", "酒吧", "学校", "办公室", "家", "街道", "公园",
}
# Tags in a memory trace that signal a new mystery should be added.
_MYSTERY_TAGS = {"谜", "谜题", "未解", "神秘", "怪异", "超自然"}
# Tags in a memory trace that signal a new faction should be added.
_FACTION_TAGS = {"组织", "势力", "团体", "同盟", "帮派", "公司"}


def _now_iso() -> str:
    """Return a UTC ISO-8601 timestamp string."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _slugify(text: str) -> str:
    """Convert arbitrary text into a stable, filesystem-safe id.

    Keeps CJK characters as-is (they are valid in JSON keys and Python dict
    keys) and replaces whitespace / punctuation with underscores.
    """
    text = (text or "").strip()
    if not text:
        return "untitled"
    cleaned = re.sub(r"[\s/\\.,;:!?\"'`<>\[\]{}|*+=()]+", "_", text)
    cleaned = re.sub(r"_+", "_", cleaned)
    cleaned = cleaned.strip("_")
    return cleaned or "untitled"


# ---------------------------------------------------------------------------
# WorldStateStore
# ---------------------------------------------------------------------------


class WorldStateStore:
    """Versioned on-disk store for a single novel's WorldStateContract.

    Layout (per ``novel_id`` under ``base_dir``)::

        {base_dir}/{novel_id}/v{N}.json        # versioned snapshots (v1, v2, ...)
        {base_dir}/{novel_id}/current.json     # latest snapshot (atomically replaced)
        {base_dir}/{novel_id}/world_state.json # human-readable projection

    Every ``save()`` writes a new ``v{N}.json`` (when ``bump_version=True``),
    atomically refreshes ``current.json`` and regenerates the
    ``world_state.json`` projection.
    """

    CURRENT_FILENAME = "current.json"
    HUMAN_READABLE_FILENAME = "world_state.json"
    VERSION_PATTERN = re.compile(r"^v(\d+)\.json$")

    def __init__(self, base_dir: str, novel_id: str) -> None:
        self._base_dir = base_dir
        self._novel_id = novel_id
        self._novel_dir = os.path.join(base_dir, novel_id)

    # ----------------------------------------------------------- properties

    @property
    def novel_dir(self) -> str:
        return self._novel_dir

    @property
    def novel_id(self) -> str:
        return self._novel_id

    # ---------------------------------------------------------------- paths

    def _version_path(self, version: int) -> str:
        return os.path.join(self._novel_dir, f"v{version}.json")

    def _current_path(self) -> str:
        return os.path.join(self._novel_dir, self.CURRENT_FILENAME)

    def _human_readable_path(self) -> str:
        return os.path.join(self._novel_dir, self.HUMAN_READABLE_FILENAME)

    # --------------------------------------------------------- low-level IO

    def _atomic_write(self, path: str, data: dict) -> None:
        """Write ``data`` to ``path`` via a ``.tmp`` file + ``os.replace``.

        ``os.replace`` is atomic on POSIX and Windows for files on the same
        filesystem, so concurrent readers never see a half-written file.
        """
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tmp_path = f"{path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(
                data,
                f,
                ensure_ascii=False,
                indent=2,
                cls=AgentStateEncoder,
            )
        os.replace(tmp_path, path)

    def _write_human_readable(self, contract: WorldStateContract) -> None:
        """Write the simplified ``world_state.json`` projection.

        The projection strips internal bookkeeping (raw ``current_state``,
        embedding-style metadata, internal flags) and surfaces the sections
        a human reader cares about: genre/tone, geography, factions, rules,
        mysteries, history, and forbidden entries.
        """
        projection = self._build_human_readable(contract)
        self._atomic_write(self._human_readable_path(), projection)

    @staticmethod
    def _build_human_readable(contract: WorldStateContract) -> dict[str, Any]:
        """Build the human-readable projection dict for ``contract``."""

        geography_summary: list[dict[str, Any]] = []
        for key, value in (contract.geography or {}).items():
            if isinstance(value, dict):
                geography_summary.append({
                    "id": key,
                    "name": value.get("name", key),
                    "activation_level": value.get("activation_level", "未探索"),
                    "mood": value.get("mood", contract.tone),
                    "description": value.get("description", ""),
                })
            else:
                geography_summary.append({"id": key, "name": key})

        factions_summary: list[dict[str, Any]] = []
        for key, value in (contract.factions or {}).items():
            if isinstance(value, Faction):
                factions_summary.append({
                    "id": key,
                    "name": value.name or key,
                    "power": value.power,
                    "influence": value.influence,
                    "relation_to_protagonist": value.relations.get(
                        "protagonist", "neutral"
                    ),
                    "description": value.description,
                })
            elif isinstance(value, dict):
                relations = value.get("relations") or {}
                factions_summary.append({
                    "id": key,
                    "name": value.get("name", key),
                    "power": value.get("power", 0.0),
                    "influence": value.get("influence", 0.0),
                    "relation_to_protagonist": relations.get(
                        "protagonist", "neutral"
                    ),
                    "description": value.get("description", ""),
                })
            else:
                factions_summary.append({"id": key, "name": key})

        rules_summary = [
            {
                "rule_id": r.rule_id,
                "statement": r.statement,
                "domain": r.domain,
                "breakable": r.breakable,
                "status": r.status,
            }
            for r in contract.rules
        ]

        open_mysteries = [
            {
                "mystery_id": m.mystery_id,
                "name": m.name,
                "description": m.description,
                "revealed": m.revealed,
            }
            for m in contract.mysteries
            if not m.revealed
        ]

        # Recent history: the contract stores events in chronological order,
        # so the tail is the most recent. Cap at 10 entries to keep the
        # projection skim-friendly.
        recent_history = [
            {
                "event_id": h.event_id,
                "name": h.name,
                "description": h.description,
                "occurred_at": h.occurred_at,
                "involved_factions": list(h.involved_factions),
            }
            for h in contract.history[-10:]
        ]

        forbidden_list = [
            {
                "forbidden_id": f.forbidden_id,
                "name": f.name,
                "description": f.description,
                "consequences": list(f.consequences),
            }
            for f in contract.forbidden
        ]

        return {
            "genre": contract.genre,
            "tone": contract.tone,
            "geography_summary": geography_summary,
            "factions_summary": factions_summary,
            "rules_summary": rules_summary,
            "open_mysteries": open_mysteries,
            "recent_history": recent_history,
            "forbidden_list": forbidden_list,
            "version": contract.version,
        }

    # --------------------------------------------------------------- loading

    @staticmethod
    def _contract_from_record(data: dict) -> WorldStateContract:
        """Reconstruct a :class:`WorldStateContract` from a saved record.

        Supports both the wrapped record format produced by :meth:`save`
        (which stores the contract under a ``contract`` key alongside
        ``reason`` / ``saved_at`` metadata) and a raw contract dict.
        """
        if isinstance(data, dict) and "contract" in data and isinstance(
            data["contract"], dict
        ):
            payload = data["contract"]
        else:
            payload = data
        # ``reconstruct_dataclass`` is preferred per Task 1.1 contract; the
        # model's own ``from_dict`` is used as a fallback if reconstruction
        # fails (e.g. due to extra/missing fields from a future schema).
        try:
            rebuilt = reconstruct_dataclass(WorldStateContract, payload)
            if rebuilt is not None:
                return rebuilt
        except Exception:
            pass
        return WorldStateContract.from_dict(payload)

    def load(self) -> WorldStateContract | None:
        """Load the latest version from ``current.json``.

        Returns ``None`` if no snapshot has been written yet.
        """
        path = self._current_path()
        if not os.path.isfile(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return self._contract_from_record(data)

    def load_version(self, version: int) -> WorldStateContract | None:
        """Load a specific versioned snapshot.

        Returns ``None`` if the version file does not exist.
        """
        path = self._version_path(version)
        if not os.path.isfile(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return self._contract_from_record(data)

    # --------------------------------------------------------------- saving

    def save(
        self,
        contract: WorldStateContract,
        *,
        bump_version: bool = True,
        reason: str = "",
    ) -> int:
        """Persist ``contract`` and return the new version number.

        - When ``bump_version`` is ``True`` (default), the version counter
          auto-increments to ``max(existing_versions) + 1`` and a new
          ``v{N}.json`` snapshot is written.
        - When ``bump_version`` is ``False``, the contract's current
          ``version`` is reused (or, if it is 0, the next free version is
          picked). Useful for re-saving an in-flight edit without forking
          history.

        In both cases ``current.json`` and ``world_state.json`` are
        atomically refreshed.
        """
        existing_versions = self.list_versions()
        if bump_version:
            new_version = (max(existing_versions) if existing_versions else 0) + 1
        else:
            if contract.version and contract.version > 0:
                new_version = contract.version
            else:
                new_version = (max(existing_versions) if existing_versions else 0) + 1

        # Work on a copy so the caller's contract instance is not mutated
        # and so we can stamp the new version on the snapshot only.
        snapshot = copy.deepcopy(contract)
        snapshot.version = new_version

        record = {
            "novel_id": snapshot.novel_id,
            "contract": dataclass_to_dict(snapshot),
            "version": new_version,
            "reason": reason,
            "saved_at": _now_iso(),
        }

        # 1. Versioned snapshot (only written when bumping, or when the
        #    target version file does not yet exist).
        version_path = self._version_path(new_version)
        if bump_version or not os.path.isfile(version_path):
            self._atomic_write(version_path, record)

        # 2. Latest pointer (atomically replaced every save).
        self._atomic_write(self._current_path(), record)

        # 3. Human-readable projection.
        self._write_human_readable(snapshot)

        return new_version

    # ------------------------------------------------------------- listing

    def list_versions(self) -> list[int]:
        """Return all version numbers currently on disk, ascending."""
        if not os.path.isdir(self._novel_dir):
            return []
        versions: list[int] = []
        for name in os.listdir(self._novel_dir):
            m = self.VERSION_PATTERN.match(name)
            if m:
                versions.append(int(m.group(1)))
        return sorted(versions)

    # ---------------------------------------------------------------- diff

    def diff(self, v1: int, v2: int) -> dict[str, Any]:
        """Compute a structural diff between two on-disk versions.

        The diff reports added/removed/changed keys for each top-level
        collection (geography, factions, rules, mysteries, history,
        forbidden) plus the version delta and tone/genre changes. Missing
        versions produce an ``error`` entry instead of raising.
        """
        c1 = self.load_version(v1)
        c2 = self.load_version(v2)
        if c1 is None:
            return {"error": f"version {v1} not found"}
        if c2 is None:
            return {"error": f"version {v2} not found"}
        return _diff_contracts(c1, c2)


# ---------------------------------------------------------------------------
# Diff helper
# ---------------------------------------------------------------------------


def _normalize_for_diff(value: Any) -> Any:
    """Normalize dataclass instances to plain dicts for comparison."""
    if hasattr(value, "to_dict"):
        return value.to_dict()
    return value


def _diff_dict_collections(
    d1: dict[str, Any], d2: dict[str, Any]
) -> dict[str, Any]:
    keys1 = set(d1.keys())
    keys2 = set(d2.keys())
    added = sorted(keys2 - keys1)
    removed = sorted(keys1 - keys2)
    changed: list[str] = []
    for k in sorted(keys1 & keys2):
        v1 = _normalize_for_diff(d1[k])
        v2 = _normalize_for_diff(d2[k])
        if v1 != v2:
            changed.append(k)
    return {"added": added, "removed": removed, "changed": changed}


def _diff_id_lists(
    l1: list[Any], l2: list[Any], key: str
) -> dict[str, Any]:
    """Diff two lists of dataclass instances by their ``key`` id field."""
    def _index(items: list[Any]) -> dict[Any, Any]:
        out: dict[Any, Any] = {}
        for item in items:
            if isinstance(item, dict):
                k = item.get(key)
            else:
                k = getattr(item, key, None)
            if k is not None:
                out[k] = item
        return out

    m1 = _index(l1)
    m2 = _index(l2)
    ids1 = set(m1.keys())
    ids2 = set(m2.keys())
    added = sorted(str(i) for i in (ids2 - ids1))
    removed = sorted(str(i) for i in (ids1 - ids2))
    changed: list[str] = []
    for k in (ids1 & ids2):
        v1 = _normalize_for_diff(m1[k])
        v2 = _normalize_for_diff(m2[k])
        if v1 != v2:
            changed.append(str(k))
    return {"added": added, "removed": removed, "changed": changed}


def _diff_contracts(
    c1: WorldStateContract, c2: WorldStateContract
) -> dict[str, Any]:
    """Compute a structural diff between two contracts."""
    return {
        "version": {"from": c1.version, "to": c2.version},
        "geography": _diff_dict_collections(c1.geography, c2.geography),
        "factions": _diff_dict_collections(c1.factions, c2.factions),
        "rules": _diff_id_lists(c1.rules, c2.rules, "rule_id"),
        "mysteries": _diff_id_lists(c1.mysteries, c2.mysteries, "mystery_id"),
        "history": _diff_id_lists(c1.history, c2.history, "event_id"),
        "forbidden": _diff_id_lists(c1.forbidden, c2.forbidden, "forbidden_id"),
        "tone_changed": c1.tone != c2.tone,
        "genre_changed": c1.genre != c2.genre,
    }


# ---------------------------------------------------------------------------
# ExperienceToWorldMapper
# ---------------------------------------------------------------------------


class ExperienceToWorldMapper:
    """Maps experience data (Memory Trace / SocialInput / DMN / IdentityCore)
    into WorldStateContract mutations.

    Per §5.2 of the refactor plan, the world evolves from:

    - Memory Traces → new geography, mysteries, historical events
    - SocialInput encounters → new factions, NPCs (via OC system, not here)
    - DMN insights → new mysteries, deepened rules
    - IdentityCore shifts → tone/forbidden adjustments

    This mapper produces *proposed mutations*; the
    :class:`WorldEvolutionRules` (or any caller) decides whether to commit
    them as a new version.

    Each mutation is a dict with the shape::

        {
            "op": "add_geography" | "add_faction" | "add_rule" |
                  "add_mystery" | "add_historical_event" | "add_forbidden" |
                  "update_geography" | "update_faction" |
                  "deepen_mystery" | "resolve_mystery" | "update_tone",
            "target": <id>,
            "value": <dict or scalar>,
            "reason": <str>,
        }

    ``update_tone`` is a small extension over the §5.2 ops list, added so
    that IdentityCore tone shifts can be expressed as mutations instead of
    being silently dropped.
    """

    # ---------------------------------------------------------------- trace

    def map_trace(
        self, trace: dict[str, Any], contract: WorldStateContract
    ) -> list[dict]:
        """Map a memory trace to proposed world mutations.

        Recognised trace keys (all optional):

        - ``tags``: list[str] — semantic tags
        - ``summary``: str — human-readable summary
        - ``content``: str — fallback if summary is empty
        - ``narrative_role``: str — one of
          ``"setting"`` / ``"character"`` / ``"event"`` / ``"theme"`` / ``"mood"``
        - ``valence``: float — emotional valence (-1..1)
        - ``arousal``: float — emotional arousal (0..1)
        - ``emotional_weight``: float — significance (0..1)
        """
        mutations: list[dict] = []
        tags = [str(t) for t in trace.get("tags", [])]
        summary = str(
            trace.get("summary") or trace.get("content") or ""
        ).strip()
        narrative_role = trace.get("narrative_role", "event")
        valence = float(trace.get("valence", 0.0))
        arousal = float(trace.get("arousal", 0.0))
        emotional_weight = float(trace.get("emotional_weight", 0.0))

        # 1. Geography: place tags or narrative_role == "setting".
        has_place_tag = any(tag in _PLACE_TAGS for tag in tags)
        if has_place_tag or narrative_role == "setting":
            place_name = summary or (tags[0] if tags else "未命名地点")
            place_id = _slugify(place_name)
            if place_id not in contract.geography:
                activation = "未探索"
                if emotional_weight > 0.5 or arousal > 0.6:
                    activation = "危险"
                elif valence < -0.3:
                    activation = "边缘空间"
                mutations.append({
                    "op": "add_geography",
                    "target": place_id,
                    "value": {
                        "name": place_name,
                        "description": summary,
                        "activation_level": activation,
                        "mood": contract.tone,
                        "introduced_via_trace": True,
                    },
                    "reason": f"trace tag suggests new geography: {place_name}",
                })
            else:
                # Revisiting an existing place → bump its activation_level.
                mutations.append({
                    "op": "update_geography",
                    "target": place_id,
                    "value": {},
                    "reason": f"trace revisits geography: {place_name}",
                })

        # 2. Historical event: significant emotional events.
        if narrative_role == "event" and (
            emotional_weight > 0.4 or arousal > 0.5
        ):
            event_name = summary or "未命名事件"
            event_id = _slugify(event_name)
            if not any(h.event_id == event_id for h in contract.history):
                mutations.append({
                    "op": "add_historical_event",
                    "target": event_id,
                    "value": {
                        "event_id": event_id,
                        "name": event_name,
                        "description": summary,
                        "occurred_at": _now_iso(),
                        "involved_factions": [],
                        "consequences": [],
                    },
                    "reason": "trace records a significant event",
                })

        # 3. Mystery: theme/mood traces or explicit mystery tags.
        has_mystery_tag = any(tag in _MYSTERY_TAGS for tag in tags)
        if has_mystery_tag or (
            narrative_role == "theme" and emotional_weight > 0.3
        ):
            mystery_name = summary or (tags[0] if tags else "未解之谜")
            mystery_id = _slugify(mystery_name)
            if not any(
                m.mystery_id == mystery_id for m in contract.mysteries
            ):
                mutations.append({
                    "op": "add_mystery",
                    "target": mystery_id,
                    "value": {
                        "mystery_id": mystery_id,
                        "name": mystery_name,
                        "description": summary,
                        "revealed": False,
                        "revealed_in_chapter": None,
                        "payoff_rules": [],
                    },
                    "reason": "trace introduces an unresolved mystery",
                })

        # 4. Faction seeds (rare from traces, but supported).
        has_faction_tag = any(tag in _FACTION_TAGS for tag in tags)
        if has_faction_tag:
            faction_name = summary or (tags[0] if tags else "未命名势力")
            faction_id = _slugify(faction_name)
            if faction_id not in contract.factions:
                mutations.append({
                    "op": "add_faction",
                    "target": faction_id,
                    "value": {
                        "faction_id": faction_id,
                        "name": faction_name,
                        "description": summary,
                        "power": 0.2,
                        "influence": 0.2,
                        "relations": {"protagonist": "neutral"},
                    },
                    "reason": "trace introduces a faction seed",
                })

        return mutations

    # ----------------------------------------------------- social encounter

    def map_social_encounter(
        self, encounter: dict[str, Any], contract: WorldStateContract
    ) -> list[dict]:
        """Map a social encounter to proposed world mutations.

        Recognised keys:

        - ``space_id``: str — physical/social space (e.g., ``"旧书店"``)
        - ``role_id``: str — role the protagonist played
        - ``gaze_pressure``: float — perceived social pressure (0..1)
        - ``dialogue_mode``: str — ``"surface"`` / ``"deep"`` / ``"performative"``
        - ``summary``: str — encounter summary
        - ``relationship_delta``: dict — relationship changes (target → delta)
        """
        mutations: list[dict] = []
        space_id = str(encounter.get("space_id", "")).strip()
        role_id = str(encounter.get("role_id", "")).strip()
        gaze_pressure = float(encounter.get("gaze_pressure", 0.0))
        dialogue_mode = encounter.get("dialogue_mode", "surface")
        summary = str(encounter.get("summary", "")).strip()

        # 1. High-pressure social space → faction seed.
        if space_id and gaze_pressure > 0.5:
            faction_id = f"{_slugify(space_id)}_circle"
            if faction_id not in contract.factions:
                mutations.append({
                    "op": "add_faction",
                    "target": faction_id,
                    "value": {
                        "faction_id": faction_id,
                        "name": f"{space_id} 圈层",
                        "description": summary or f"在 {space_id} 形成的社会圈层",
                        "power": min(0.8, 0.2 + gaze_pressure * 0.3),
                        "influence": min(0.8, 0.2 + gaze_pressure * 0.3),
                        "relations": {"protagonist": "ambivalent"},
                    },
                    "reason": (
                        f"high gaze_pressure ({gaze_pressure:.2f}) in {space_id}"
                    ),
                })

        # 2. New social rule: deep dialogue modes imply a social contract.
        if role_id and dialogue_mode in {"deep", "performative"}:
            rule_id = _slugify(f"social_{role_id}_{dialogue_mode}")
            statement = (
                f"在 {space_id or '社交场合'} 中扮演 {role_id} 时，"
                f"对话进入 {dialogue_mode} 模式须遵守特定的礼仪。"
            )
            if not any(r.rule_id == rule_id for r in contract.rules):
                mutations.append({
                    "op": "add_rule",
                    "target": rule_id,
                    "value": {
                        "rule_id": rule_id,
                        "domain": "social",
                        "statement": statement,
                        "breakable": True,
                        "consequences": ["关系冷却", "角色声誉受损"],
                        "introduced_in": space_id or "social encounter",
                        "status": "active",
                    },
                    "reason": f"deep social encounter as {role_id}",
                })

        # 3. Relationship delta → faction relation update (if faction exists).
        relationship_delta = encounter.get("relationship_delta") or {}
        if space_id and relationship_delta:
            faction_id = f"{_slugify(space_id)}_circle"
            if faction_id in contract.factions:
                mutations.append({
                    "op": "update_faction",
                    "target": faction_id,
                    "value": {"relations_delta": dict(relationship_delta)},
                    "reason": "social encounter shifts faction relations",
                })

        return mutations

    # ----------------------------------------------------------- DMN insight

    def map_dmn_insight(
        self, insight: dict[str, Any], contract: WorldStateContract
    ) -> list[dict]:
        """Map a DMN (default-mode-network) insight to proposed world mutations.

        Recognised keys:

        - ``content``: str — the insight text
        - ``summary``: str — fallback if content is empty
        - ``tags``: list[str]
        - ``is_metaphor``: bool — whether the insight is metaphorical
        - ``touches_taboo``: bool — whether the insight touches a taboo
        """
        mutations: list[dict] = []
        content = str(
            insight.get("content") or insight.get("summary") or ""
        ).strip()
        tags = [str(t) for t in insight.get("tags", [])]
        is_metaphor = bool(insight.get("is_metaphor", False))
        touches_taboo = bool(insight.get("touches_taboo", False))

        if not content:
            return mutations

        # 1. Metaphorical insights become mystical rules.
        if is_metaphor or any(t in _MYSTERY_TAGS for t in tags):
            rule_id = f"mystical_{_slugify(content)[:40]}"
            if not any(r.rule_id == rule_id for r in contract.rules):
                mutations.append({
                    "op": "add_rule",
                    "target": rule_id,
                    "value": {
                        "rule_id": rule_id,
                        "domain": "mystical",
                        "statement": content,
                        "breakable": False,
                        "consequences": ["现实扭曲", "因果错位"],
                        "introduced_in": "DMN",
                        "status": "active",
                    },
                    "reason": "DMN metaphor mapped to mystical rule",
                })

        # 2. Taboo-touching insights become forbidden entries.
        if touches_taboo:
            forbidden_id = f"taboo_{_slugify(content)[:40]}"
            if not any(
                f.forbidden_id == forbidden_id for f in contract.forbidden
            ):
                mutations.append({
                    "op": "add_forbidden",
                    "target": forbidden_id,
                    "value": {
                        "forbidden_id": forbidden_id,
                        "name": content[:60],
                        "description": content,
                        "consequences": ["sanity 削减", "现实感流失"],
                        "introduced_in": "DMN",
                    },
                    "reason": "DMN insight touches a taboo",
                })

        # 3. Insights with strong content become mysteries.
        if len(content) > 8 and not is_metaphor:
            mystery_id = f"dmn_{_slugify(content)[:40]}"
            if not any(
                m.mystery_id == mystery_id for m in contract.mysteries
            ):
                mutations.append({
                    "op": "add_mystery",
                    "target": mystery_id,
                    "value": {
                        "mystery_id": mystery_id,
                        "name": content[:60],
                        "description": content,
                        "revealed": False,
                        "revealed_in_chapter": None,
                        "payoff_rules": ["需在情绪高点揭示"],
                    },
                    "reason": "DMN insight becomes an open mystery",
                })

        return mutations

    # ------------------------------------------------------ identity shift

    def map_identity_shift(
        self, identity: dict[str, Any], contract: WorldStateContract
    ) -> list[dict]:
        """Map an IdentityCore shift to proposed world mutations.

        Recognised keys:

        - ``values``: list[str] — current values
        - ``core_conflict``: str — current core conflict
        - ``tone_shift``: str — suggested tone adjustment
        - ``new_taboos``: list[str] — newly internalised taboos
        """
        mutations: list[dict] = []

        # 1. Tone adjustment (extension op, see class docstring).
        tone_shift = identity.get("tone_shift")
        if tone_shift and tone_shift != contract.tone:
            mutations.append({
                "op": "update_tone",
                "target": "tone",
                "value": str(tone_shift),
                "reason": "IdentityCore tone shift",
            })

        # 2. Core conflict → narrative rule.
        core_conflict = identity.get("core_conflict")
        if core_conflict:
            rule_id = f"narrative_{_slugify(core_conflict)[:40]}"
            if not any(r.rule_id == rule_id for r in contract.rules):
                mutations.append({
                    "op": "add_rule",
                    "target": rule_id,
                    "value": {
                        "rule_id": rule_id,
                        "domain": "narrative",
                        "statement": f"核心矛盾：{core_conflict}",
                        "breakable": False,
                        "consequences": ["叙事张力流失"],
                        "introduced_in": "IdentityCore",
                        "status": "active",
                    },
                    "reason": "IdentityCore core conflict",
                })

        # 3. New taboos → forbidden entries.
        new_taboos = identity.get("new_taboos") or []
        for taboo in new_taboos:
            taboo_str = str(taboo)
            forbidden_id = f"identity_{_slugify(taboo_str)[:40]}"
            if not any(
                f.forbidden_id == forbidden_id for f in contract.forbidden
            ):
                mutations.append({
                    "op": "add_forbidden",
                    "target": forbidden_id,
                    "value": {
                        "forbidden_id": forbidden_id,
                        "name": taboo_str[:60],
                        "description": taboo_str,
                        "consequences": ["自我疏离", "叙事一致性受损"],
                        "introduced_in": "IdentityCore",
                    },
                    "reason": "IdentityCore internalises a new taboo",
                })

        return mutations


# ---------------------------------------------------------------------------
# WorldEvolutionRules
# ---------------------------------------------------------------------------


class WorldEvolutionRules:
    """Encodes the stability rules of §5.3:

    - **稳定规则**: foundational rules (rules with ``breakable=False``) never
      change status. Any mutation that would alter them is skipped.
    - **禁忌代价**: forbidden entries carry consequences; ``add_forbidden``
      mutations without consequences are skipped and a historical event is
      recorded.
    - **神秘感管理**: open mysteries should not exceed ``MAX_OPEN_MYSTERIES``;
      resolved ones move to history.
    - **地点活化**: geography entries gain ``activation_level`` from visit
      frequency, progressing ``未探索 → 熟悉 → 危险 → 改变``.
    - **势力变化**: factions shift ``power`` / ``influence`` / ``relations``
      based on events; values are clamped to ``[0.0, 1.0]``.
    """

    MAX_OPEN_MYSTERIES = 7

    # Activation level progression per §5.2.3 (地点活化).
    _ACTIVATION_PROGRESSON = ["未探索", "熟悉", "危险", "改变"]

    # ------------------------------------------------------- apply mutations

    def apply_mutations(
        self,
        contract: WorldStateContract,
        mutations: list[dict],
    ) -> tuple[WorldStateContract, list[str]]:
        """Apply ``mutations`` to ``contract`` and return the new contract.

        Mutations that violate stability rules are skipped; their attempted
        violation is recorded as a :class:`HistoricalEvent` with the rule's
        declared consequences. Each successfully applied mutation appends a
        short human-readable description to the returned list.

        The original ``contract`` is not mutated; a deep copy is returned.
        """
        new_contract = copy.deepcopy(contract)
        applied: list[str] = []

        for mutation in mutations:
            op = mutation.get("op")
            target = mutation.get("target")
            value = mutation.get("value")
            reason = mutation.get("reason", "")

            if op == "add_geography":
                applied.extend(
                    self._apply_add_geography(new_contract, target, value, reason)
                )

            elif op == "update_geography":
                applied.extend(
                    self._apply_update_geography(new_contract, target, value, reason)
                )

            elif op == "add_faction":
                applied.extend(
                    self._apply_add_faction(new_contract, target, value, reason)
                )

            elif op == "update_faction":
                applied.extend(
                    self._apply_update_faction(new_contract, target, value, reason)
                )

            elif op == "add_rule":
                applied.extend(
                    self._apply_add_rule(new_contract, target, value, reason)
                )

            elif op == "add_mystery":
                applied.extend(
                    self._apply_add_mystery(new_contract, target, value, reason)
                )

            elif op == "deepen_mystery":
                applied.extend(
                    self._apply_deepen_mystery(new_contract, target, value, reason)
                )

            elif op == "resolve_mystery":
                applied.extend(
                    self._apply_resolve_mystery(new_contract, target, value, reason)
                )

            elif op == "add_historical_event":
                applied.extend(
                    self._apply_add_historical_event(new_contract, target, value, reason)
                )

            elif op == "add_forbidden":
                applied.extend(
                    self._apply_add_forbidden(new_contract, target, value, reason)
                )

            elif op == "update_tone":
                if isinstance(value, str) and value:
                    old_tone = new_contract.tone
                    new_contract.tone = value
                    applied.append(f"update tone: {old_tone} → {value}")
                else:
                    applied.append("skip update_tone: empty value")

            else:
                applied.append(f"skip unknown op: {op}")

        return new_contract, applied

    # ----------------------------------------------------- mutation handlers

    def _apply_add_geography(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str) or target in contract.geography:
            return []
        contract.geography[target] = value if isinstance(value, dict) else {}
        return [f"add geography: {target}"]

    def _apply_update_geography(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str) or target not in contract.geography:
            return []
        entry = contract.geography[target]
        if not isinstance(entry, dict):
            entry = {"name": target}
        # Bump activation_level forward one notch unless the caller
        # explicitly requests a specific level.
        current_activation = entry.get("activation_level", "未探索")
        if isinstance(value, dict) and "activation_level" in value:
            entry["activation_level"] = value["activation_level"]
        else:
            try:
                idx = self._ACTIVATION_PROGRESSON.index(current_activation)
            except ValueError:
                idx = 0
            if idx < len(self._ACTIVATION_PROGRESSON) - 1:
                entry["activation_level"] = self._ACTIVATION_PROGRESSON[idx + 1]
        # Merge any other fields the caller requested.
        if isinstance(value, dict):
            for k, v in value.items():
                if k != "activation_level":
                    entry[k] = v
        contract.geography[target] = entry
        return [
            f"update geography: {target} → {entry.get('activation_level')}"
        ]

    def _apply_add_faction(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str) or target in contract.factions:
            return []
        contract.factions[target] = value if isinstance(value, dict) else {}
        return [f"add faction: {target}"]

    def _apply_update_faction(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str) or target not in contract.factions:
            return []
        entry = contract.factions[target]
        if not isinstance(entry, dict):
            entry = {"name": target}
        if isinstance(value, dict):
            # Power / influence clamping per §5.2.3 势力变化.
            if "power" in value:
                try:
                    entry["power"] = max(0.0, min(1.0, float(value["power"])))
                except (TypeError, ValueError):
                    pass
            if "influence" in value:
                try:
                    entry["influence"] = max(0.0, min(1.0, float(value["influence"])))
                except (TypeError, ValueError):
                    pass
            if "relations_delta" in value and isinstance(
                value["relations_delta"], dict
            ):
                relations = dict(entry.get("relations") or {})
                relations.update(value["relations_delta"])
                entry["relations"] = relations
            for k, v in value.items():
                if k not in {"power", "influence", "relations_delta"}:
                    entry[k] = v
        contract.factions[target] = entry
        return [f"update faction: {target}"]

    def _apply_add_rule(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str):
            return []
        if any(r.rule_id == target for r in contract.rules):
            return []
        rule = self._coerce_dataclass(value, WorldRule)
        if rule is None:
            return [f"skip add_rule: invalid value for {target}"]
        contract.rules.append(rule)
        return [f"add rule: {target} ({rule.domain})"]

    def _apply_add_mystery(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str):
            return []
        if any(m.mystery_id == target for m in contract.mysteries):
            return []
        # 神秘感管理: enforce open mystery budget.
        open_count = sum(1 for m in contract.mysteries if not m.revealed)
        if open_count >= self.MAX_OPEN_MYSTERIES:
            return [
                f"skip mystery {target}: open budget "
                f"({open_count}/{self.MAX_OPEN_MYSTERIES}) exhausted"
            ]
        mystery = self._coerce_dataclass(value, Mystery)
        if mystery is None:
            return [f"skip add_mystery: invalid value for {target}"]
        contract.mysteries.append(mystery)
        return [f"add mystery: {target}"]

    def _apply_deepen_mystery(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str):
            return []
        mystery = next(
            (m for m in contract.mysteries if m.mystery_id == target), None
        )
        if mystery is None:
            return []
        if isinstance(value, dict):
            if "description" in value and value["description"]:
                mystery.description = (
                    f"{mystery.description}\n[深ed] {value['description']}".strip()
                )
            if "payoff_rules" in value and isinstance(
                value["payoff_rules"], list
            ):
                mystery.payoff_rules = list(
                    dict.fromkeys(  # de-dup, preserve order
                        mystery.payoff_rules + list(value["payoff_rules"])
                    )
                )
        return [f"deepen mystery: {target}"]

    def _apply_resolve_mystery(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str):
            return []
        mystery = next(
            (m for m in contract.mysteries if m.mystery_id == target), None
        )
        if mystery is None or mystery.revealed:
            return []
        mystery.revealed = True
        revealed_in = (
            value.get("revealed_in_chapter")
            if isinstance(value, dict)
            else None
        )
        if revealed_in:
            mystery.revealed_in_chapter = revealed_in
        # 神秘感管理: record the resolution in history.
        event_id = f"mystery_resolved_{target}"
        if not any(h.event_id == event_id for h in contract.history):
            contract.history.append(HistoricalEvent(
                event_id=event_id,
                name=f"谜题揭晓：{mystery.name or target}",
                description=mystery.description,
                occurred_at=_now_iso(),
                involved_factions=[],
                consequences=[],
            ))
        return [f"resolve mystery: {target}"]

    def _apply_add_historical_event(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str):
            return []
        if any(h.event_id == target for h in contract.history):
            return []
        event = self._coerce_dataclass(value, HistoricalEvent)
        if event is None:
            return [f"skip add_historical_event: invalid value for {target}"]
        contract.history.append(event)
        return [f"add historical event: {target}"]

    def _apply_add_forbidden(
        self,
        contract: WorldStateContract,
        target: Any,
        value: Any,
        reason: str,
    ) -> list[str]:
        if not isinstance(target, str):
            return []
        if any(f.forbidden_id == target for f in contract.forbidden):
            return []
        forbidden = self._coerce_dataclass(value, Forbidden)
        if forbidden is None:
            return [f"skip add_forbidden: invalid value for {target}"]
        # 禁忌代价: every forbidden must declare at least one consequence.
        if not forbidden.consequences:
            contract.history.append(HistoricalEvent(
                event_id=f"forbidden_rejected_{target}",
                name=f"禁忌未生效：{forbidden.name or target}",
                description=(
                    f"试图引入禁忌 {target}，但未声明 consequences，"
                    f"已被世界演进规则拒绝。"
                ),
                occurred_at=_now_iso(),
                involved_factions=[],
                consequences=[],
            ))
            return [
                f"BLOCKED add_forbidden: {target} (no consequences declared, "
                f"violation recorded in history)"
            ]
        contract.forbidden.append(forbidden)
        return [f"add forbidden: {target}"]

    # ------------------------------------------------------------- validate

    def validate(self, contract: WorldStateContract) -> list[str]:
        """Return a list of validation warnings (empty list = valid)."""
        warnings: list[str] = []

        # 神秘感管理.
        open_count = sum(1 for m in contract.mysteries if not m.revealed)
        if open_count > self.MAX_OPEN_MYSTERIES:
            warnings.append(
                f"open mysteries ({open_count}) exceed budget "
                f"({self.MAX_OPEN_MYSTERIES})"
            )

        # 稳定规则: breakable=False rules must remain 'active'.
        for rule in contract.rules:
            if not rule.breakable and rule.status != "active":
                warnings.append(
                    f"stable rule {rule.rule_id} has status '{rule.status}' "
                    f"(must remain 'active')"
                )

        # 禁忌代价: every forbidden must declare consequences.
        for forbidden in contract.forbidden:
            if not forbidden.consequences:
                warnings.append(
                    f"forbidden {forbidden.forbidden_id} has no consequences"
                )

        # 势力变化: power/influence must be in [0, 1].
        for key, value in contract.factions.items():
            if isinstance(value, Faction):
                power, influence = value.power, value.influence
            elif isinstance(value, dict):
                power = value.get("power", 0.0)
                influence = value.get("influence", 0.0)
            else:
                continue
            try:
                if not 0.0 <= float(power) <= 1.0:
                    warnings.append(
                        f"faction {key} power out of range: {power}"
                    )
            except (TypeError, ValueError):
                warnings.append(f"faction {key} power is not numeric: {power}")
            try:
                if not 0.0 <= float(influence) <= 1.0:
                    warnings.append(
                        f"faction {key} influence out of range: {influence}"
                    )
            except (TypeError, ValueError):
                warnings.append(
                    f"faction {key} influence is not numeric: {influence}"
                )

        # Geography entries should have a name.
        for key, value in contract.geography.items():
            if isinstance(value, dict) and not value.get("name"):
                warnings.append(f"geography {key} has no 'name' field")

        # Uniqueness checks.
        mystery_ids = [m.mystery_id for m in contract.mysteries]
        if len(set(mystery_ids)) != len(mystery_ids):
            warnings.append("duplicate mystery_id values detected")
        rule_ids = [r.rule_id for r in contract.rules]
        if len(set(rule_ids)) != len(rule_ids):
            warnings.append("duplicate rule_id values detected")
        event_ids = [h.event_id for h in contract.history]
        if len(set(event_ids)) != len(event_ids):
            warnings.append("duplicate event_id values detected")
        forbidden_ids = [f.forbidden_id for f in contract.forbidden]
        if len(set(forbidden_ids)) != len(forbidden_ids):
            warnings.append("duplicate forbidden_id values detected")

        return warnings

    # ------------------------------------------------------------- helpers

    @staticmethod
    def _coerce_dataclass(value: Any, cls: type) -> Any:
        """Coerce ``value`` into an instance of ``cls``.

        Accepts either an existing instance (returned as-is when its type
        matches) or a dict (reconstructed via ``cls.from_dict``).
        Returns ``None`` if coercion is not possible.
        """
        if isinstance(value, cls):
            return value
        if isinstance(value, dict):
            try:
                return cls.from_dict(value)
            except Exception:
                return None
        return None


# ---------------------------------------------------------------------------
# Convenience functions
# ---------------------------------------------------------------------------


def create_default_world_state(
    novel_id: str,
    genre: str = "literary fiction",
    tone: str = "melancholic",
) -> WorldStateContract:
    """Create a minimal but non-empty WorldStateContract for a new novel.

    Unlike the old hardcoded default world, this seeds only:

    - one geography entry (the protagonist's anchor place)
    - one faction (背景势力)
    - two foundational rules (``breakable=False``)
    - no mysteries yet (added by experience)

    The contract starts at ``version=0``; the first call to
    :meth:`WorldStateStore.save` will bump it to ``1``.
    """
    return WorldStateContract(
        novel_id=novel_id,
        genre=genre,
        tone=tone,
        geography={
            "anchor_place": {
                "name": "林逸的居所",
                "description": "主角的固定锚点空间，故事从这里开始。",
                "activation_level": "熟悉",
                "mood": tone,
            },
        },
        factions={
            "background_force": {
                "faction_id": "background_force",
                "name": "背景势力",
                "description": "尚未显形的潜在势力，作为世界背景存在。",
                "power": 0.2,
                "influence": 0.2,
                "relations": {"protagonist": "neutral"},
            },
        },
        rules=[
            WorldRule(
                rule_id="physical_basis",
                domain="physical",
                statement="物理世界遵循因果律，时间不可逆。",
                breakable=False,
                consequences=["叙事一致性崩坏"],
                introduced_in="default",
                status="active",
            ),
            WorldRule(
                rule_id="social_basis",
                domain="social",
                statement="社会关系以信任与背叛为基本货币。",
                breakable=False,
                consequences=["角色动机断裂"],
                introduced_in="default",
                status="active",
            ),
        ],
        history=[],
        forbidden=[],
        mysteries=[],
        current_state={"initialized_at": _now_iso()},
        version=0,
    )


def load_or_create_world_state(
    store: WorldStateStore,
    novel_id: str,
    **kwargs: Any,
) -> WorldStateContract:
    """Load the existing contract from ``store`` or create a new default.

    Extra ``kwargs`` are forwarded to :func:`create_default_world_state`
    when creation is needed. The returned contract is **not** auto-saved;
    the caller is expected to call ``store.save(contract, ...)`` to persist
    it (which will assign ``version=1`` on first save).
    """
    existing = store.load()
    if existing is not None:
        return existing
    return create_default_world_state(novel_id=novel_id, **kwargs)
