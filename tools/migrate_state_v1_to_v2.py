#!/usr/bin/env python3
"""Migrate v1 agent state to v2 format.

Per docs/系统重构方案_v1.md §7 (数据迁移与降级) this script transforms a
legacy agent_state.json (v1) into the new v2 format:

- Backs up the original file to ``agent_state.json.v1.bak``
- Extracts ``modules.MentalSandbox.world_model`` into a WorldStateContract
  and writes it to ``world_state/{novel_id}/current.json``
- Extracts ``modules.MentalSandbox.characters`` (legacy CharacterProjection
  list) into OCCharacterSheet entries (projection_ratio=0) and writes them
  to ``oc_registry/{novel_id}.json``
- Extracts ``modules.NovelOutput.paragraphs`` (flat list) into a single
  Chapter (volume 1, chapter 1) and writes to ``chapters/{novel_id}/v1/c1/``
- Builds a StoryBible from extracted data + IdentityCore + Metabolism
  metadata, writes to ``story_bible/{novel_id}.json``
- Writes the new v2 agent_state.json (modules dict slimmed down — Sandbox
  and NovelOutput no longer carry world/paragraphs; they reference external
  files instead)
- On any validation failure, the backup is preserved and the migration
  aborts with a non-zero exit code.

Usage:
    python tools/migrate_state_v1_to_v2.py [--state-path PATH]
        [--novel-id ID] [--output-dir DIR] [--dry-run] [--force]
"""

from __future__ import annotations

import argparse
import copy
import datetime
import hashlib
import json
import math
import os
import random
import shutil
import sys
import traceback
from typing import Any

# Ensure /workspace is on sys.path so `from src.novelist_brain...` works.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_DIR = os.path.dirname(SCRIPT_DIR)
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

from src.novelist_brain.models import (
    Chapter,
    ChapterIntent,
    ChapterVersion,
    Desire,
    Fear,
    HistoricalEvent,
    LuckPool,
    OCCharacterSheet,
    Paragraph,
    PlotCompass,
    Relationship,
    SanitySystem,
    StoryBible,
    StyleFingerprint,
    TraitVector,
    WorldRule,
    WorldStateContract,
)
from src.novelist_brain.persistence import PersistenceManager
from src.novelist_brain.world_state import WorldStateStore


# COC standard 8 attributes (mirrors oc_character_system.COC_ATTRIBUTES).
_COC_ATTRIBUTES: tuple[str, ...] = (
    "str",
    "con",
    "dex",
    "int",
    "pow",
    "app",
    "edu",
    "siz",
)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    """Return a UTC ISO-8601 timestamp string."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _now_ts() -> float:
    """Return the current UTC Unix timestamp."""
    return datetime.datetime.now(datetime.timezone.utc).timestamp()


def _stable_seed(seed_str: str) -> int:
    """Hash a string to a stable integer seed.

    ``random.Random(str)`` uses ``hash(str)`` which is salted per process
    (PYTHONHASHSEED), so two migrations of the same character would produce
    different COC rolls. Using hashlib gives a reproducible seed.
    """
    digest = hashlib.md5(seed_str.encode("utf-8")).hexdigest()
    return int(digest, 16) % (2**32)


def _roll_3d6_times_5(rng: random.Random) -> int:
    """Roll 3d6 and multiply by 5 (COC attribute generation)."""
    return sum(rng.randint(1, 6) for _ in range(3)) * 5


# ---------------------------------------------------------------------------
# Legacy payload coercion helpers (mirror OCCharacterSystem._coerce_*)
# ---------------------------------------------------------------------------


def _coerce_trait_vector(value: Any) -> TraitVector:
    if isinstance(value, TraitVector):
        return value
    if isinstance(value, dict):
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


def _coerce_relationships(value: Any) -> dict[str, Relationship]:
    """Coerce legacy relationships (list or dict) into dict[str, Relationship]."""
    out: dict[str, Relationship] = {}
    if isinstance(value, dict):
        for key, v in value.items():
            if isinstance(v, Relationship):
                out[str(key)] = v
            elif isinstance(v, dict):
                try:
                    out[str(key)] = Relationship(
                        **{
                            k: v2
                            for k, v2 in v.items()
                            if k
                            in {
                                "target_id",
                                "target_name",
                                "type",
                                "intensity",
                                "trust",
                                "history",
                            }
                        }
                    )
                except TypeError:
                    pass
        return out
    if isinstance(value, list):
        for item in value:
            if isinstance(item, Relationship):
                if item.target_id:
                    out[item.target_id] = item
                continue
            if not isinstance(item, dict):
                continue
            target_id = item.get("target_id") or item.get("target_name")
            if not target_id:
                continue
            try:
                out[str(target_id)] = Relationship(
                    **{
                        k: v
                        for k, v in item.items()
                        if k
                        in {
                            "target_id",
                            "target_name",
                            "type",
                            "intensity",
                            "trust",
                            "history",
                        }
                    }
                )
            except TypeError:
                pass
    return out


# ---------------------------------------------------------------------------
# SubTask 1.8.1: backup
# ---------------------------------------------------------------------------


def backup_v1_state(state_path: str) -> str:
    """Back up the original v1 state file to ``{state_path}.v1.bak``.

    The caller is responsible for the ``--force`` check (refusing to
    overwrite an existing backup) before invoking this helper.
    Returns the backup path.
    """
    backup_path = f"{state_path}.v1.bak"
    shutil.copy2(state_path, backup_path)
    return backup_path


# ---------------------------------------------------------------------------
# SubTask 1.8.2: extract world contract
# ---------------------------------------------------------------------------


def extract_world_contract(
    sandbox_state: dict[str, Any],
    novel_id: str,
) -> WorldStateContract:
    """Build a WorldStateContract from the legacy ``world_model``.

    Legacy world_model structure::

        {
            "name": "default",
            "ontology": {"genre": "...", "tone": "...", ...},
            "rules": ["str", ...] or [{"rule_id": ..., "statement": ...}, ...],
            "current_state": {...},
            "history": ["str", ...] or [{"event_id": ..., ...}, ...],
            ...
        }
    """
    world_model = sandbox_state.get("world_model") or {}
    if not isinstance(world_model, dict):
        world_model = {}
    ontology = world_model.get("ontology") or {}
    if not isinstance(ontology, dict):
        ontology = {}

    rules_raw = world_model.get("rules", []) or []
    rules: list[WorldRule] = []
    for i, r in enumerate(rules_raw):
        if isinstance(r, str):
            rules.append(
                WorldRule(
                    rule_id=f"legacy_rule_{i}",
                    domain="narrative",
                    statement=r,
                    breakable=True,
                    introduced_in="v1_migration",
                )
            )
        elif isinstance(r, dict):
            rules.append(
                WorldRule(
                    rule_id=r.get("rule_id") or r.get("name") or f"legacy_rule_{i}",
                    domain=r.get("domain", "narrative"),
                    statement=(
                        r.get("statement")
                        or r.get("description")
                        or r.get("name", "")
                    ),
                    breakable=bool(r.get("breakable", True)),
                    consequences=list(r.get("consequences", [])),
                    introduced_in=r.get("introduced_in", "v1_migration"),
                    status=r.get("status", "active"),
                )
            )

    history_raw = world_model.get("history", []) or []
    history: list[HistoricalEvent] = []
    for i, h in enumerate(history_raw):
        if isinstance(h, str):
            history.append(
                HistoricalEvent(
                    event_id=f"legacy_event_{i}",
                    name=h[:80] if h else f"legacy_event_{i}",
                    description=h,
                    occurred_at="",
                )
            )
        elif isinstance(h, dict):
            history.append(
                HistoricalEvent(
                    event_id=(
                        h.get("event_id") or h.get("name") or f"legacy_event_{i}"
                    ),
                    name=h.get("name", f"legacy_event_{i}"),
                    description=h.get("description", ""),
                    occurred_at=h.get("occurred_at") or h.get("timestamp") or "",
                    involved_factions=list(h.get("involved_factions", [])),
                    consequences=list(h.get("consequences", [])),
                )
            )

    return WorldStateContract(
        novel_id=novel_id,
        genre=ontology.get("genre", "literary fiction"),
        tone=ontology.get("tone", "melancholic"),
        geography=ontology.get("geography", {}) or {},
        factions=ontology.get("factions", {}) or {},
        rules=rules,
        history=history,
        forbidden=[],  # v1 had no forbidden concept
        mysteries=[],  # v1 had no mysteries concept
        current_state=world_model.get("current_state", {}) or {},
        version=1,
    )


# ---------------------------------------------------------------------------
# SubTask 1.8.3: extract OC characters
# ---------------------------------------------------------------------------


def _convert_to_oc_sheet(
    legacy_char: dict[str, Any],
    novel_id: str,
    index: int,
) -> OCCharacterSheet:
    """Convert a single legacy CharacterProjection dict to an OCCharacterSheet.

    Uses a deterministic RNG seeded from the character name so the same
    legacy state always migrates to the same COC rolls (reproducible across
    processes). COC attributes are rolled fresh — v1 had no COC data to
    migrate. Identity fields (``name`` / ``archetype``) are locked via
    ``immutable_facts``.
    """
    name = str(legacy_char.get("name") or f"migrated_char_{index}")
    archetype = str(legacy_char.get("archetype") or "")

    seed_str = name or str(index)
    rng = random.Random(_stable_seed(seed_str))

    # Roll 8 COC attributes (3d6 × 5 each).
    coc_attributes: dict[str, int] = {
        attr: _roll_3d6_times_5(rng) for attr in _COC_ATTRIBUTES
    }

    # Derived stats (COC 7e formulas).
    con = coc_attributes["con"]
    siz = coc_attributes["siz"]
    pow_ = coc_attributes["pow"]
    hp = math.floor((con + siz) / 10)
    mp = math.floor(pow_ / 5)
    san_current = min(pow_ * 5, 99)
    luck_current = min(_roll_3d6_times_5(rng), 99)

    sanity = SanitySystem(
        current_sanity=float(san_current),
        max_sanity=float(99),
    )
    luck = LuckPool(current=luck_current, max=99, spent_today=0)

    character_id = str(
        legacy_char.get("character_id")
        or legacy_char.get("id")
        or f"{novel_id}_oc_{index}"
    )

    source_traces = list(
        legacy_char.get("source_trace_ids")
        or legacy_char.get("source_traces")
        or []
    )

    traits = _coerce_trait_vector(legacy_char.get("traits"))
    desires = _coerce_desires(legacy_char.get("desires"))
    fears = _coerce_fears(legacy_char.get("fears"))
    relationships = _coerce_relationships(legacy_char.get("relationships"))
    internal_conflict = str(legacy_char.get("internal_conflict") or "")
    current_goal = str(legacy_char.get("current_goal") or "")

    return OCCharacterSheet(
        character_id=character_id,
        name=name,
        archetype=archetype,
        role_in_story="supporting",
        source_traces=source_traces,
        traits=traits,
        values=[],
        desires=desires,
        fears=fears,
        internal_conflict=internal_conflict,
        coc_attributes=coc_attributes,
        coc_skills={},
        sanity=sanity,
        luck=luck,
        hit_points=float(hp),
        magic_points=float(mp),
        inventory={},
        conditions=[],
        improvement_marks={},
        relationships=relationships,
        current_goal=current_goal,
        current_emotional_state={},
        narrative_arc=[],
        immutable_facts=["name", "archetype"],
        projection_ratio=0.0,
    )


def extract_oc_characters(
    sandbox_state: dict[str, Any],
    novel_id: str,
) -> dict[str, OCCharacterSheet]:
    """Convert legacy CharacterProjection list to OCCharacterSheet dict.

    Returns a dict keyed by ``character_id`` (auto-generated if missing).
    Every migrated sheet has ``projection_ratio=0.0`` and
    ``immutable_facts=["name", "archetype"]``.
    """
    legacy_chars = sandbox_state.get("characters") or []
    if not isinstance(legacy_chars, list):
        return {}
    out: dict[str, OCCharacterSheet] = {}
    for i, char in enumerate(legacy_chars):
        if not isinstance(char, dict):
            continue
        sheet = _convert_to_oc_sheet(char, novel_id, i)
        out[sheet.character_id] = sheet
    return out


# ---------------------------------------------------------------------------
# SubTask 1.8.4: extract chapter
# ---------------------------------------------------------------------------


def extract_chapter(
    novel_output_state: dict[str, Any],
    novel_id: str,
) -> Chapter:
    """Convert flat paragraphs list to a single Chapter (volume 1, chapter 1).

    Legacy NovelOutput.paragraphs may be either a ``list[str]`` (the actual
    runtime form) or a ``list[dict]`` with ``text`` / ``scene_id`` /
    ``narrative_line_id`` keys (per the spec sample). Both shapes are
    accepted.
    """
    chapter_id = "c1"
    volume_id = "v1"
    chapter_ref = f"{volume_id}:{chapter_id}"
    now_ts = _now_ts()

    paragraphs: list[Paragraph] = []
    legacy_paragraphs = novel_output_state.get("paragraphs") or []
    if isinstance(legacy_paragraphs, list):
        for i, p in enumerate(legacy_paragraphs):
            if isinstance(p, str):
                paragraphs.append(
                    Paragraph(
                        content=p,
                        chapter_id=chapter_ref,
                        audit_metadata={
                            "migrated_from": "v1",
                            "legacy_index": i,
                        },
                    )
                )
            elif isinstance(p, dict):
                content = p.get("text") or p.get("content") or ""
                audit: dict[str, Any] = {
                    "migrated_from": "v1",
                    "legacy_index": i,
                }
                if p.get("scene_id"):
                    audit["legacy_scene_id"] = p.get("scene_id")
                if p.get("narrative_line_id"):
                    audit["legacy_narrative_line_id"] = p.get(
                        "narrative_line_id"
                    )
                paragraphs.append(
                    Paragraph(
                        content=str(content),
                        chapter_id=chapter_ref,
                        audit_metadata=audit,
                    )
                )

    intent = ChapterIntent(
        chapter_index=1,
        scene_type="transition",
        narrative_beats=["迁移自 v1"],
    )

    initial_version = ChapterVersion(
        version_id="v1_initial",
        created_at=now_ts,
        paragraphs=list(paragraphs),
        intent=intent,
        change_summary="迁移自 v1",
    )

    return Chapter(
        chapter_id=chapter_id,
        volume_id=volume_id,
        index=1,
        title="迁移归档",
        intent=intent,
        paragraphs=paragraphs,
        status="committed",
        versions=[initial_version],
        created_at=now_ts,
        committed_at=now_ts,
    )


# ---------------------------------------------------------------------------
# SubTask 1.8.5: build story bible
# ---------------------------------------------------------------------------


def build_story_bible(
    novel_id: str,
    world_contract: WorldStateContract,
    oc_registry: dict[str, OCCharacterSheet],
    chapter: Chapter,
    identity_state: dict[str, Any],
) -> StoryBible:
    """Build a StoryBible from extracted v1 data + IdentityCore metadata."""
    current_novel = identity_state.get("current_novel") or {}
    if not isinstance(current_novel, dict):
        current_novel = {}

    title = str(current_novel.get("title") or "迁移归档")
    theme = str(current_novel.get("theme") or "")
    premise = str(identity_state.get("internal_conflict") or "")

    # Style fingerprint from voice_signature if available. The legacy
    # voice_signature holds qualitative descriptors rather than numeric
    # metrics, so we surface them as tone_markers with weight 1.0.
    voice = identity_state.get("voice_signature") or {}
    if not isinstance(voice, dict):
        voice = {}
    tone_markers: dict[str, float] = {}
    for key in ("sentence_rhythm", "sensory_bias", "emotional_register"):
        val = voice.get(key)
        if isinstance(val, str) and val:
            tone_markers[val] = 1.0
    style_fingerprint = StyleFingerprint(tone_markers=tone_markers)

    # One ChapterIntent blueprint representing the migrated archive chapter.
    blueprint = [
        ChapterIntent(
            chapter_index=1,
            scene_type="transition",
            narrative_beats=["迁移自 v1"],
        )
    ]

    return StoryBible(
        novel_id=novel_id,
        title=title,
        genre=world_contract.genre,
        theme=theme,
        premise=premise,
        world_contract=world_contract,
        character_registry=dict(oc_registry),
        plot_compass=PlotCompass(),
        foreshadowing_ledger=[],
        chapter_blueprint=blueprint,
        style_fingerprint=style_fingerprint,
        continuity_rules=[
            "人物行为符合 OC traits",
            "世界设定不冲突",
        ],
    )


# ---------------------------------------------------------------------------
# SubTask 1.8.6: write v2 state
# ---------------------------------------------------------------------------


def write_v2_state(
    state_path: str,
    v1_state: dict[str, Any],
    novel_id: str,
    world_contract: WorldStateContract,
    oc_registry: dict[str, OCCharacterSheet],
    chapter: Chapter,
    story_bible: StoryBible,
    output_dir: str,
) -> dict[str, Any]:
    """Build the new v2 agent_state dict (caller persists it).

    The v2 state preserves the original clock and most modules' state, but:
    - ``modules.MentalSandbox`` loses ``world_model`` / ``characters`` /
      ``narrative_lines`` (now external files)
    - ``modules.NovelOutput`` loses ``paragraphs`` (now external files)
    - Adds top-level ``v2_refs`` pointing to the new artifact files
    - Updates ``version`` to 2 and refreshes ``saved_at``
    """
    v2_state = copy.deepcopy(v1_state)
    v2_state["version"] = 2
    v2_state["saved_at"] = _now_iso()

    modules = v2_state.get("modules") or {}
    if isinstance(modules, dict):
        sandbox = modules.get("MentalSandbox")
        if isinstance(sandbox, dict):
            for key in ("world_model", "characters", "narrative_lines"):
                sandbox.pop(key, None)
        novel_output = modules.get("NovelOutput")
        if isinstance(novel_output, dict):
            novel_output.pop("paragraphs", None)

    v2_state["v2_refs"] = {
        "world_state_path": f"world_state/{novel_id}/current.json",
        "oc_registry_path": f"oc_registry/{novel_id}.json",
        "chapter_path": f"chapters/{novel_id}/v1/c1/chapter.json",
        "story_bible_path": f"story_bible/{novel_id}.json",
    }
    return v2_state


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_migration(
    output_dir: str,
    novel_id: str,
    v2_state: dict[str, Any],
) -> list[str]:
    """Validate that all v2 artifacts exist and the v2 state is well-formed.

    Returns a list of validation errors (empty list = success). On any
    error the caller should preserve the ``.v1.bak`` backup and abort.
    """
    errors: list[str] = []

    ws_path = os.path.join(output_dir, "world_state", novel_id, "current.json")
    if not os.path.isfile(ws_path):
        errors.append(f"missing world_state file: {ws_path}")

    oc_path = os.path.join(output_dir, "oc_registry", f"{novel_id}.json")
    if not os.path.isfile(oc_path):
        errors.append(f"missing oc_registry file: {oc_path}")

    ch_path = os.path.join(
        output_dir, "chapters", novel_id, "v1", "c1", "chapter.json"
    )
    if not os.path.isfile(ch_path):
        errors.append(f"missing chapter file: {ch_path}")

    sb_path = os.path.join(output_dir, "story_bible", f"{novel_id}.json")
    if not os.path.isfile(sb_path):
        errors.append(f"missing story_bible file: {sb_path}")

    if v2_state.get("version") != 2:
        errors.append(
            f"v2 state version should be 2, got {v2_state.get('version')}"
        )

    return errors


# ---------------------------------------------------------------------------
# Main migration flow
# ---------------------------------------------------------------------------


def migrate(
    state_path: str,
    novel_id: str,
    output_dir: str,
    *,
    dry_run: bool = False,
    force: bool = False,
) -> int:
    """Run the full v1 → v2 migration.

    Returns 0 on success, non-zero on failure:

    - 1: state file not found
    - 2: backup already exists (use ``--force``)
    - 3: invalid JSON
    - 4: state is already v2 (use ``--force``)
    - 5: extraction failed
    - 6: validation failed (backup preserved)
    - 7: write failure (backup preserved)
    """
    # 1. Load v1 state.
    if not os.path.isfile(state_path):
        print(f"ERROR: state file not found: {state_path}", file=sys.stderr)
        return 1

    backup_path = f"{state_path}.v1.bak"
    if os.path.exists(backup_path) and not force:
        print(
            f"ERROR: backup {backup_path} already exists. "
            f"Use --force to overwrite.",
            file=sys.stderr,
        )
        return 2

    try:
        with open(state_path, "r", encoding="utf-8") as f:
            v1_state = json.load(f)
    except json.JSONDecodeError as exc:
        print(f"ERROR: invalid JSON in {state_path}: {exc}", file=sys.stderr)
        return 3

    if v1_state.get("version", 1) >= 2:
        print(
            f"WARNING: state file is already v2 "
            f"(version={v1_state.get('version')})",
            file=sys.stderr,
        )
        if not force:
            return 4

    # 2. Extract v1 module states.
    modules = v1_state.get("modules", {}) or {}
    sandbox_state = modules.get("MentalSandbox", {}) or {}
    novel_output_state = modules.get("NovelOutput", {}) or {}
    identity_state = modules.get("IdentityCore", {}) or {}

    try:
        # SubTask 1.8.2
        world_contract = extract_world_contract(sandbox_state, novel_id)
        # SubTask 1.8.3
        oc_registry = extract_oc_characters(sandbox_state, novel_id)
        # SubTask 1.8.4
        chapter = extract_chapter(novel_output_state, novel_id)
        # SubTask 1.8.5
        story_bible = build_story_bible(
            novel_id, world_contract, oc_registry, chapter, identity_state
        )
    except Exception as exc:
        print(f"ERROR: extraction failed: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 5

    if dry_run:
        print("=== DRY RUN ===")
        print(f"Would back up: {state_path} -> {backup_path}")
        print(
            f"Would write world_state to: "
            f"{output_dir}/world_state/{novel_id}/current.json"
        )
        print(
            f"Would write oc_registry to: "
            f"{output_dir}/oc_registry/{novel_id}.json"
        )
        print(
            f"Would write chapter to: "
            f"{output_dir}/chapters/{novel_id}/v1/c1/chapter.json"
        )
        print(f"Would write story_bible to: {output_dir}/story_bible/{novel_id}.json")
        print(f"Would write v2 state to: {state_path}")
        print(f"  - OC count: {len(oc_registry)}")
        print(f"  - Paragraph count: {len(chapter.paragraphs)}")
        print(f"  - World rules: {len(world_contract.rules)}")
        return 0

    # 3. Back up v1 state (SubTask 1.8.1).
    backup_path = backup_v1_state(state_path)
    print(f"Backed up v1 state to: {backup_path}")

    try:
        # 4. Write artifacts.

        # World state (versioned save via WorldStateStore).
        ws_store = WorldStateStore(
            base_dir=os.path.join(output_dir, "world_state"),
            novel_id=novel_id,
        )
        ws_store.save(world_contract, reason="migrated from v1")
        print(f"Wrote world_state v{world_contract.version}")

        # OC registry.
        oc_data = {
            "novel_id": novel_id,
            "saved_at": _now_iso(),
            "sheets": {
                cid: sheet.to_dict() for cid, sheet in oc_registry.items()
            },
        }
        oc_path = os.path.join(output_dir, "oc_registry", f"{novel_id}.json")
        PersistenceManager.save_atomic(oc_data, oc_path)
        print(f"Wrote oc_registry: {len(oc_registry)} characters")

        # Chapter.
        ch_dir = os.path.join(
            output_dir, "chapters", novel_id, "v1", "c1"
        )
        ch_path = os.path.join(ch_dir, "chapter.json")
        PersistenceManager.save_atomic(chapter.to_dict(), ch_path)
        print(f"Wrote chapter: {len(chapter.paragraphs)} paragraphs")

        # Story Bible.
        sb_path = os.path.join(output_dir, "story_bible", f"{novel_id}.json")
        PersistenceManager.save_atomic(story_bible.to_dict(), sb_path)
        print("Wrote story_bible")

        # 5. Write v2 state (SubTask 1.8.6).
        v2_state = write_v2_state(
            state_path,
            v1_state,
            novel_id,
            world_contract,
            oc_registry,
            chapter,
            story_bible,
            output_dir,
        )
        PersistenceManager.save_atomic(v2_state, state_path)
        print(f"Wrote v2 state: {state_path}")

        # 6. Validate.
        errors = validate_migration(output_dir, novel_id, v2_state)
        if errors:
            print("VALIDATION FAILED:", file=sys.stderr)
            for e in errors:
                print(f"  - {e}", file=sys.stderr)
            print(f"Backup preserved at: {backup_path}", file=sys.stderr)
            # Do NOT restore v1 over the failed v2 — the backup is
            # preserved and the user can manually restore if needed.
            return 6

        print("Migration completed successfully.")
        return 0

    except Exception as exc:
        print(f"ERROR during migration: {exc}", file=sys.stderr)
        traceback.print_exc()
        print(f"Backup preserved at: {backup_path}", file=sys.stderr)
        return 7


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migrate v1 agent state to v2 format."
    )
    parser.add_argument(
        "--state-path",
        default="agent_state.json",
        help="Path to the v1 agent_state.json (default: agent_state.json)",
    )
    parser.add_argument(
        "--novel-id",
        default="linyi_default",
        help="Novel ID for the new v2 artifacts (default: linyi_default)",
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Base output directory for v2 artifacts (default: current dir)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without writing files",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing backup and re-migrate v2 state",
    )
    args = parser.parse_args()

    return migrate(
        state_path=args.state_path,
        novel_id=args.novel_id,
        output_dir=args.output_dir,
        dry_run=args.dry_run,
        force=args.force,
    )


if __name__ == "__main__":
    sys.exit(main())
