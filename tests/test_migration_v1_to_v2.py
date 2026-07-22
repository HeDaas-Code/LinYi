"""Tests for ``tools/migrate_state_v1_to_v2.py``.

Covers the full v1 → v2 migration pipeline:

- Backup of the original v1 ``agent_state.json``.
- Extraction of a :class:`WorldStateContract` from the legacy
  ``MentalSandbox.world_model``.
- Extraction of :class:`OCCharacterSheet` entries from the legacy
  ``MentalSandbox.characters`` list (with deterministic COC rolls).
- Extraction of a single-volume / single-chapter :class:`Chapter` from the
  legacy flat ``NovelOutput.paragraphs`` list (both ``list[str]`` and
  ``list[dict]`` shapes).
- Construction of a :class:`StoryBible` from the extracted data plus
  ``IdentityCore`` metadata.
- Writing the new v2 ``agent_state.json`` (slimmed modules + ``v2_refs``).
- End-to-end CLI invocation (exit code 0 + all v2 artifacts written).
- Failure / degradation paths (exit codes 1, 2, 3, 4, 5).
- ``--dry-run`` and ``--force`` modes.
- Cross-process reproducibility of the deterministic COC seed.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

# Ensure the workspace root is importable for direct unit-level imports
# of the migration tool (it lives under ``tools/`` rather than ``src/``).
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from src.novelist_brain.models import (  # noqa: E402
    Chapter,
    ChapterVersion,
    HistoricalEvent,
    OCCharacterSheet,
    StoryBible,
    StyleFingerprint,
    WorldRule,
    WorldStateContract,
)
from src.novelist_brain.world_state import WorldStateStore  # noqa: E402
from tools.migrate_state_v1_to_v2 import (  # noqa: E402
    backup_v1_state,
    build_story_bible,
    extract_chapter,
    extract_oc_characters,
    extract_world_contract,
    migrate,
    write_v2_state,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_legacy_v1_state() -> dict[str, Any]:
    """Build a representative v1 agent_state.json payload."""
    return {
        "version": 1,
        "saved_at": "2024-01-01T00:00:00+00:00",
        "clock": {"tick": 42, "phase": "deep_night"},
        "modules": {
            "MentalSandbox": {
                "world_model": {
                    "name": "default",
                    "ontology": {
                        "genre": "literary fiction",
                        "tone": "melancholic",
                        "geography": {"anchor": {"name": "林逸的居所"}},
                        "factions": {"bg": {"name": "背景势力"}},
                    },
                    "rules": [
                        "物理世界遵循因果律",
                        {
                            "rule_id": "social_basis",
                            "domain": "social",
                            "statement": "社会关系以信任与背叛为基本货币",
                            "breakable": False,
                            "consequences": ["角色动机断裂"],
                            "introduced_in": "default",
                            "status": "active",
                        },
                    ],
                    "history": [
                        "故事开始于一个寻常的清晨",
                        {
                            "event_id": "evt_1",
                            "name": "初次相遇",
                            "description": "主角与神秘人相遇",
                            "occurred_at": "2024-01-01",
                            "involved_factions": ["bg"],
                            "consequences": ["埋下伏笔"],
                        },
                    ],
                    "current_state": {"time": "morning", "mood": "calm"},
                },
                "characters": [
                    {
                        "character_id": "char_alice",
                        "name": "Alice",
                        "archetype": "observer",
                        "source_trace_ids": ["trace_1"],
                        "traits": {
                            "openness": 0.8,
                            "conscientiousness": 0.6,
                            "extraversion": 0.4,
                            "agreeableness": 0.7,
                            "neuroticism": 0.3,
                        },
                        "desires": [{"object": "真相", "strength": 0.9, "urgency": 0.7}],
                        "fears": [{"object": "孤独", "intensity": 0.6, "permanent": False}],
                        "relationships": [
                            {
                                "target_id": "char_bob",
                                "target_name": "Bob",
                                "type": "ally",
                                "intensity": 0.5,
                                "trust": 0.4,
                                "history": ["共同冒险"],
                            }
                        ],
                        "internal_conflict": "追寻真相 vs 安全感",
                        "current_goal": "查清过去",
                    },
                    {
                        "id": "char_bob",
                        "name": "Bob",
                        "archetype": "catalyst",
                    },
                ],
                "narrative_lines": [{"id": "nl_1", "status": "draft"}],
            },
            "NovelOutput": {
                "paragraphs": [
                    "清晨的阳光穿过窗帘。",
                    "林逸端起咖啡，凝视着窗外。",
                ],
            },
            "IdentityCore": {
                "current_novel": {
                    "title": "旧日回响",
                    "theme": "记忆与身份",
                },
                "internal_conflict": "自我认同 vs 他者投射",
                "voice_signature": {
                    "sentence_rhythm": "短句堆叠",
                    "sensory_bias": "视觉主导",
                    "emotional_register": "克制",
                },
            },
        },
    }


def _write_state(path: Path, state: dict[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return path


@pytest.fixture
def v1_state() -> dict[str, Any]:
    return _make_legacy_v1_state()


@pytest.fixture
def state_path(tmp_path: Path, v1_state: dict[str, Any]) -> Path:
    return _write_state(tmp_path / "agent_state.json", v1_state)


# ---------------------------------------------------------------------------
# SubTask 1.8.1: backup
# ---------------------------------------------------------------------------


def test_backup_v1_state_creates_identical_backup(tmp_path: Path, v1_state: dict[str, Any]) -> None:
    state_file = _write_state(tmp_path / "agent_state.json", v1_state)
    original_bytes = state_file.read_bytes()

    backup_path = backup_v1_state(str(state_file))

    assert backup_path == f"{state_file}.v1.bak"
    assert os.path.isfile(backup_path)
    # Content must be byte-identical to the original (shutil.copy2 preserves data).
    assert Path(backup_path).read_bytes() == original_bytes


# ---------------------------------------------------------------------------
# SubTask 1.8.2: extract_world_contract
# ---------------------------------------------------------------------------


def test_extract_world_contract_converts_strings_and_dicts() -> None:
    sandbox_state = {
        "world_model": {
            "ontology": {
                "genre": "urban fantasy",
                "tone": "nocturnal",
                "geography": {"city": {"name": "夜之城"}},
                "factions": {"guild": {"name": "公会"}},
            },
            "rules": [
                "魔法需要代价",
                {
                    "rule_id": "rule_social",
                    "domain": "social",
                    "statement": "承诺不可轻易打破",
                    "breakable": False,
                    "consequences": ["信任崩塌"],
                    "introduced_in": "manual",
                    "status": "active",
                },
            ],
            "history": [
                "远古之战结束",
                {
                    "event_id": "evt_founding",
                    "name": "建城",
                    "description": "夜之城建立",
                    "occurred_at": "0001-01-01",
                    "involved_factions": ["guild"],
                    "consequences": ["秩序确立"],
                },
            ],
            "current_state": {"weather": "rain"},
        }
    }

    contract = extract_world_contract(sandbox_state, novel_id="novel_x")

    assert isinstance(contract, WorldStateContract)
    assert contract.novel_id == "novel_x"
    assert contract.genre == "urban fantasy"
    assert contract.tone == "nocturnal"
    assert contract.geography == {"city": {"name": "夜之城"}}
    assert contract.factions == {"guild": {"name": "公会"}}
    assert contract.current_state == {"weather": "rain"}
    assert contract.forbidden == []
    assert contract.mysteries == []
    assert contract.version == 1

    # String rule → legacy_rule_<i> with domain=narrative, breakable=True
    r0 = contract.rules[0]
    assert isinstance(r0, WorldRule)
    assert r0.rule_id == "legacy_rule_0"
    assert r0.domain == "narrative"
    assert r0.statement == "魔法需要代价"
    assert r0.breakable is True
    assert r0.introduced_in == "v1_migration"
    assert r0.status == "active"

    # Dict rule → preserved verbatim
    r1 = contract.rules[1]
    assert r1.rule_id == "rule_social"
    assert r1.domain == "social"
    assert r1.breakable is False
    assert r1.consequences == ["信任崩塌"]
    assert r1.introduced_in == "manual"

    # String history → legacy_event_<i>, occurred_at=""
    h0 = contract.history[0]
    assert isinstance(h0, HistoricalEvent)
    assert h0.event_id == "legacy_event_0"
    assert h0.description == "远古之战结束"
    assert h0.occurred_at == ""

    # Dict history → preserved
    h1 = contract.history[1]
    assert h1.event_id == "evt_founding"
    assert h1.name == "建城"
    assert h1.occurred_at == "0001-01-01"
    assert h1.involved_factions == ["guild"]
    assert h1.consequences == ["秩序确立"]


def test_extract_world_contract_handles_missing_fields() -> None:
    # Empty sandbox_state should still produce a valid (defaulted) contract.
    contract = extract_world_contract({}, novel_id="empty")

    assert contract.novel_id == "empty"
    assert contract.genre == "literary fiction"
    assert contract.tone == "melancholic"
    assert contract.rules == []
    assert contract.history == []


# ---------------------------------------------------------------------------
# SubTask 1.8.3: extract_oc_characters
# ---------------------------------------------------------------------------


def test_extract_oc_characters_basic_fields() -> None:
    sandbox_state = {
        "characters": [
            {
                "character_id": "char_alice",
                "name": "Alice",
                "archetype": "observer",
                "source_trace_ids": ["t1"],
                "internal_conflict": "追寻真相 vs 安全感",
                "current_goal": "查清过去",
            },
            {
                # No character_id → falls back to ``id`` field.
                "id": "char_bob",
                "name": "Bob",
                "archetype": "catalyst",
            },
        ]
    }

    registry = extract_oc_characters(sandbox_state, novel_id="novel_x")

    assert set(registry.keys()) == {"char_alice", "char_bob"}
    alice = registry["char_alice"]
    assert isinstance(alice, OCCharacterSheet)
    assert alice.name == "Alice"
    assert alice.archetype == "observer"
    assert alice.role_in_story == "supporting"
    assert alice.source_traces == ["t1"]
    assert alice.internal_conflict == "追寻真相 vs 安全感"
    assert alice.current_goal == "查清过去"
    # Identity-lock fields per spec.
    assert alice.immutable_facts == ["name", "archetype"]
    assert alice.projection_ratio == 0.0
    # COC attributes rolled fresh: all 8 standard attributes present and sane.
    assert set(alice.coc_attributes.keys()) == {
        "str", "con", "dex", "int", "pow", "app", "edu", "siz",
    }
    for val in alice.coc_attributes.values():
        # 3d6 × 5 ∈ [15, 90]
        assert 15 <= val <= 90
    # Derived stats.
    assert alice.hit_points >= 0
    assert alice.magic_points >= 0
    assert 0 <= alice.sanity.current_sanity <= 99
    assert alice.sanity.max_sanity == 99
    assert 0 <= alice.luck.current <= 99


def test_extract_oc_characters_deterministic_seed() -> None:
    """Same character name must produce identical COC attributes across calls.

    The migration tool deliberately hashes the name via ``hashlib.md5``
    rather than ``random.Random(str)`` so re-migrations are reproducible
    across processes (PYTHONHASHSEED-salted ``hash()`` would diverge).
    """
    sandbox_state = {
        "characters": [
            {"name": "Reproducible Hero", "archetype": "sage"},
        ]
    }

    run1 = extract_oc_characters(sandbox_state, novel_id="novel_a")
    run2 = extract_oc_characters(sandbox_state, novel_id="novel_b")

    sheet1 = list(run1.values())[0]
    sheet2 = list(run2.values())[0]

    assert sheet1.coc_attributes == sheet2.coc_attributes
    assert sheet1.hit_points == sheet2.hit_points
    assert sheet1.magic_points == sheet2.magic_points
    assert sheet1.sanity.current_sanity == sheet2.sanity.current_sanity
    assert sheet1.luck.current == sheet2.luck.current


def test_extract_oc_characters_rejects_non_list_payload() -> None:
    # A dict payload (legacy alternate form) is not supported by the
    # extractor and should yield an empty registry, not raise.
    registry = extract_oc_characters({"characters": {"alice": {}}}, novel_id="x")
    assert registry == {}


# ---------------------------------------------------------------------------
# SubTask 1.8.4: extract_chapter
# ---------------------------------------------------------------------------


def test_extract_chapter_from_string_paragraphs() -> None:
    novel_output_state = {
        "paragraphs": ["第1段。", "第2段。", "第3段。"],
    }

    chapter = extract_chapter(novel_output_state, novel_id="novel_x")

    assert isinstance(chapter, Chapter)
    assert chapter.chapter_id == "c1"
    assert chapter.volume_id == "v1"
    assert chapter.index == 1
    assert chapter.status == "committed"
    assert chapter.title == "迁移归档"
    assert chapter.committed_at is not None

    # Paragraph content + audit metadata.
    assert len(chapter.paragraphs) == 3
    for i, p in enumerate(chapter.paragraphs):
        assert p.content == f"第{i + 1}段。"
        assert p.chapter_id == "v1:c1"
        assert p.audit_metadata["migrated_from"] == "v1"
        assert p.audit_metadata["legacy_index"] == i

    # One historical version snapshot is attached.
    assert len(chapter.versions) == 1
    version: ChapterVersion = chapter.versions[0]
    assert version.version_id == "v1_initial"
    assert version.change_summary == "迁移自 v1"
    assert len(version.paragraphs) == 3
    assert version.intent is not None
    assert version.intent.chapter_index == 1
    assert version.intent.scene_type == "transition"


def test_extract_chapter_from_dict_paragraphs() -> None:
    novel_output_state = {
        "paragraphs": [
            {"text": "dict-form paragraph", "scene_id": "s1", "narrative_line_id": "nl_1"},
            # ``content`` key as an alternative to ``text``.
            {"content": "alt content"},
        ]
    }

    chapter = extract_chapter(novel_output_state, novel_id="novel_x")

    assert len(chapter.paragraphs) == 2
    p0 = chapter.paragraphs[0]
    assert p0.content == "dict-form paragraph"
    assert p0.audit_metadata["legacy_scene_id"] == "s1"
    assert p0.audit_metadata["legacy_narrative_line_id"] == "nl_1"
    p1 = chapter.paragraphs[1]
    assert p1.content == "alt content"


def test_extract_chapter_empty_paragraphs() -> None:
    chapter = extract_chapter({}, novel_id="novel_x")
    assert chapter.paragraphs == []
    # Still produces a valid (empty) version snapshot.
    assert len(chapter.versions) == 1
    assert chapter.versions[0].paragraphs == []


# ---------------------------------------------------------------------------
# SubTask 1.8.5: build_story_bible
# ---------------------------------------------------------------------------


def test_build_story_bible_maps_identity_metadata() -> None:
    world_contract = WorldStateContract(
        novel_id="novel_x",
        genre="urban fantasy",
        tone="nocturnal",
    )
    oc_registry = {"char_alice": OCCharacterSheet(character_id="char_alice", name="Alice")}
    chapter = extract_chapter({"paragraphs": ["一段。"]}, novel_id="novel_x")
    identity_state = {
        "current_novel": {"title": "夜行记", "theme": "孤独与连接"},
        "internal_conflict": "自我 vs 他者",
        "voice_signature": {
            "sentence_rhythm": "短句",
            "sensory_bias": "视觉",
            "emotional_register": "克制",
        },
    }

    bible = build_story_bible(
        "novel_x", world_contract, oc_registry, chapter, identity_state
    )

    assert isinstance(bible, StoryBible)
    assert bible.novel_id == "novel_x"
    assert bible.title == "夜行记"
    assert bible.theme == "孤独与连接"
    assert bible.premise == "自我 vs 他者"
    assert bible.genre == "urban fantasy"
    assert bible.world_contract is world_contract
    assert "char_alice" in bible.character_registry

    # StyleFingerprint tone_markers surface qualitative voice descriptors.
    assert isinstance(bible.style_fingerprint, StyleFingerprint)
    assert bible.style_fingerprint.tone_markers == {
        "短句": 1.0,
        "视觉": 1.0,
        "克制": 1.0,
    }

    # One ChapterIntent blueprint representing the migrated archive chapter.
    assert len(bible.chapter_blueprint) == 1
    assert bible.chapter_blueprint[0].chapter_index == 1
    # Continuity rules seeded.
    assert "人物行为符合 OC traits" in bible.continuity_rules
    assert "世界设定不冲突" in bible.continuity_rules


def test_build_story_bible_falls_back_on_missing_identity() -> None:
    bible = build_story_bible(
        "novel_x",
        WorldStateContract(novel_id="novel_x", genre="g", tone="t"),
        {},
        extract_chapter({}, novel_id="novel_x"),
        identity_state={},
    )
    assert bible.title == "迁移归档"
    assert bible.theme == ""
    assert bible.premise == ""
    assert bible.style_fingerprint.tone_markers == {}


# ---------------------------------------------------------------------------
# SubTask 1.8.6: write_v2_state
# ---------------------------------------------------------------------------


def test_write_v2_state_strips_modules_and_adds_refs(v1_state: dict[str, Any]) -> None:
    world_contract = WorldStateContract(novel_id="novel_x", genre="g", tone="t")
    oc_registry = {"c1": OCCharacterSheet(character_id="c1", name="n")}
    chapter = extract_chapter({"paragraphs": ["p"]}, novel_id="novel_x")
    bible = build_story_bible(
        "novel_x", world_contract, oc_registry, chapter, identity_state={}
    )

    v2_state = write_v2_state(
        state_path="/tmp/ignored.json",
        v1_state=v1_state,
        novel_id="novel_x",
        world_contract=world_contract,
        oc_registry=oc_registry,
        chapter=chapter,
        story_bible=bible,
        output_dir="/tmp/out",
    )

    # Version bumped to 2; saved_at refreshed.
    assert v2_state["version"] == 2
    assert v2_state["saved_at"] != v1_state["saved_at"]

    # MentalSandbox slimmed: world_model / characters / narrative_lines removed.
    sandbox = v2_state["modules"]["MentalSandbox"]
    assert "world_model" not in sandbox
    assert "characters" not in sandbox
    assert "narrative_lines" not in sandbox

    # NovelOutput slimmed: paragraphs removed.
    novel_output = v2_state["modules"]["NovelOutput"]
    assert "paragraphs" not in novel_output

    # v2_refs present with relative paths.
    refs = v2_state["v2_refs"]
    assert refs["world_state_path"] == "world_state/novel_x/current.json"
    assert refs["oc_registry_path"] == "oc_registry/novel_x.json"
    assert refs["chapter_path"] == "chapters/novel_x/v1/c1/chapter.json"
    assert refs["story_bible_path"] == "story_bible/novel_x.json"

    # Original v1_state must NOT be mutated (deep-copy contract).
    assert v1_state["version"] == 1
    assert "world_model" in v1_state["modules"]["MentalSandbox"]
    assert "characters" in v1_state["modules"]["MentalSandbox"]


# ---------------------------------------------------------------------------
# End-to-end CLI migration
# ---------------------------------------------------------------------------


def _run_cli(
    state_path: Path,
    novel_id: str,
    output_dir: Path,
    *extra: str,
) -> subprocess.CompletedProcess[int]:
    cmd = [
        sys.executable,
        "tools/migrate_state_v1_to_v2.py",
        "--state-path",
        str(state_path),
        "--novel-id",
        novel_id,
        "--output-dir",
        str(output_dir),
        *extra,
    ]
    return subprocess.run(
        cmd,
        cwd=str(WORKSPACE_ROOT),
        capture_output=True,
        text=True,
    )


def test_migrate_end_to_end_cli_succeeds(
    tmp_path: Path, v1_state: dict[str, Any]
) -> None:
    state_file = _write_state(tmp_path / "agent_state.json", v1_state)
    output_dir = tmp_path / "out"

    result = _run_cli(state_file, "novel_e2e", output_dir)

    assert result.returncode == 0, (
        f"stdout={result.stdout!r}\nstderr={result.stderr!r}"
    )

    # v1 backup file is created alongside the original state.
    assert (tmp_path / "agent_state.json.v1.bak").is_file()
    # Backup content matches the original v1 payload (byte-for-byte).
    assert (tmp_path / "agent_state.json.v1.bak").read_text(encoding="utf-8") == \
        json.dumps(v1_state, ensure_ascii=False, indent=2)

    # All four v2 artifact files exist.
    ws_current = output_dir / "world_state" / "novel_e2e" / "current.json"
    ws_version = output_dir / "world_state" / "novel_e2e" / "v1.json"
    oc_registry = output_dir / "oc_registry" / "novel_e2e.json"
    chapter_file = output_dir / "chapters" / "novel_e2e" / "v1" / "c1" / "chapter.json"
    story_bible = output_dir / "story_bible" / "novel_e2e.json"

    assert ws_current.is_file(), f"missing world_state current.json: {result.stderr}"
    assert ws_version.is_file(), "missing world_state v1.json"
    assert oc_registry.is_file(), "missing oc_registry file"
    assert chapter_file.is_file(), "missing chapter file"
    assert story_bible.is_file(), "missing story_bible file"

    # The state file itself is overwritten with the v2 payload.
    new_state = json.loads(state_file.read_text(encoding="utf-8"))
    assert new_state["version"] == 2
    assert new_state["v2_refs"]["world_state_path"] == "world_state/novel_e2e/current.json"
    # Slimmed modules.
    sandbox = new_state["modules"]["MentalSandbox"]
    assert "world_model" not in sandbox
    assert "characters" not in sandbox
    assert "narrative_lines" not in sandbox
    assert "paragraphs" not in new_state["modules"]["NovelOutput"]

    # The migrated world_state file round-trips through WorldStateStore.
    store = WorldStateStore(
        base_dir=str(output_dir / "world_state"), novel_id="novel_e2e"
    )
    loaded = store.load()
    assert loaded is not None
    assert loaded.novel_id == "novel_e2e"
    assert loaded.genre == "literary fiction"
    assert any(r.rule_id == "social_basis" for r in loaded.rules)

    # OC registry carries two migrated sheets with projection_ratio=0.0.
    oc_data = json.loads(oc_registry.read_text(encoding="utf-8"))
    assert oc_data["novel_id"] == "novel_e2e"
    assert set(oc_data["sheets"].keys()) == {"char_alice", "char_bob"}
    for sheet in oc_data["sheets"].values():
        assert sheet["projection_ratio"] == 0.0
        assert sheet["immutable_facts"] == ["name", "archetype"]


def test_migrate_end_to_end_in_process_succeeds(
    tmp_path: Path, v1_state: dict[str, Any]
) -> None:
    """Direct ``migrate()`` call (no subprocess) — easier introspection."""
    state_file = _write_state(tmp_path / "agent_state.json", v1_state)
    output_dir = tmp_path / "out"

    exit_code = migrate(
        state_path=str(state_file),
        novel_id="novel_inproc",
        output_dir=str(output_dir),
    )

    assert exit_code == 0
    assert (tmp_path / "agent_state.json.v1.bak").is_file()
    assert (output_dir / "world_state" / "novel_inproc" / "current.json").is_file()
    assert (output_dir / "oc_registry" / "novel_inproc.json").is_file()
    assert (output_dir / "chapters" / "novel_inproc" / "v1" / "c1" / "chapter.json").is_file()
    assert (output_dir / "story_bible" / "novel_inproc.json").is_file()


# ---------------------------------------------------------------------------
# Failure / degradation paths
# ---------------------------------------------------------------------------


def test_migrate_missing_state_file_returns_1(tmp_path: Path) -> None:
    missing = tmp_path / "does_not_exist.json"
    result = _run_cli(missing, "novel_x", tmp_path / "out")
    assert result.returncode == 1
    assert "not found" in result.stderr.lower()


def test_migrate_existing_backup_returns_2_without_force(
    tmp_path: Path, v1_state: dict[str, Any]
) -> None:
    state_file = _write_state(tmp_path / "agent_state.json", v1_state)
    # Pre-existing backup should block migration unless --force is supplied.
    (tmp_path / "agent_state.json.v1.bak").write_text("old backup", encoding="utf-8")

    result = _run_cli(state_file, "novel_x", tmp_path / "out")
    assert result.returncode == 2
    assert "already exists" in result.stderr.lower()
    # The pre-existing backup is preserved untouched.
    assert (tmp_path / "agent_state.json.v1.bak").read_text(encoding="utf-8") == "old backup"


def test_migrate_invalid_json_returns_3(tmp_path: Path) -> None:
    state_file = tmp_path / "agent_state.json"
    state_file.write_text("{ this is not valid json", encoding="utf-8")

    result = _run_cli(state_file, "novel_x", tmp_path / "out")
    assert result.returncode == 3
    assert "invalid json" in result.stderr.lower()


def test_migrate_already_v2_returns_4(tmp_path: Path) -> None:
    v2_state = _make_legacy_v1_state()
    v2_state["version"] = 2
    state_file = _write_state(tmp_path / "agent_state.json", v2_state)

    result = _run_cli(state_file, "novel_x", tmp_path / "out")
    assert result.returncode == 4
    assert "already v2" in result.stderr.lower()


def test_migrate_extraction_failure_returns_5_and_preserves_original(
    tmp_path: Path,
) -> None:
    """Trigger an extraction failure and verify the original file is untouched.

    ``extract_world_contract`` accepts arbitrary dicts, so to force an
    exception inside the extraction try-block we monkey-patch
    ``extract_world_contract`` to raise. The migration script's
    ``migrate()`` function imports its helpers at module scope, so we patch
    the symbol on the ``tools.migrate_state_v1_to_v2`` module directly.
    """
    import tools.migrate_state_v1_to_v2 as mig

    v1_state = _make_legacy_v1_state()
    state_file = _write_state(tmp_path / "agent_state.json", v1_state)
    original_bytes = state_file.read_bytes()

    original_extract = mig.extract_world_contract

    def _boom(sandbox_state, novel_id):  # noqa: ANN001
        raise RuntimeError("forced extraction failure")

    mig.extract_world_contract = _boom  # type: ignore[assignment]
    try:
        exit_code = migrate(
            state_path=str(state_file),
            novel_id="novel_x",
            output_dir=str(tmp_path / "out"),
        )
    finally:
        mig.extract_world_contract = original_extract  # type: ignore[assignment]

    assert exit_code == 5
    # Extraction failure happens BEFORE backup_v1_state is called, so the
    # original state file must be byte-for-byte unchanged.
    assert state_file.read_bytes() == original_bytes
    # And no backup file should have been created.
    assert not (tmp_path / "agent_state.json.v1.bak").exists()


# ---------------------------------------------------------------------------
# --dry-run / --force
# ---------------------------------------------------------------------------


def test_migrate_dry_run_writes_no_files(
    tmp_path: Path, v1_state: dict[str, Any]
) -> None:
    state_file = _write_state(tmp_path / "agent_state.json", v1_state)
    output_dir = tmp_path / "out"

    result = _run_cli(state_file, "novel_x", output_dir, "--dry-run")

    assert result.returncode == 0
    assert "DRY RUN" in result.stdout
    # No backup, no v2 state, no artifacts.
    assert not (tmp_path / "agent_state.json.v1.bak").exists()
    assert not output_dir.exists()
    # State file is unchanged.
    assert json.loads(state_file.read_text(encoding="utf-8"))["version"] == 1


def test_migrate_force_overwrites_existing_backup(
    tmp_path: Path, v1_state: dict[str, Any]
) -> None:
    state_file = _write_state(tmp_path / "agent_state.json", v1_state)
    (tmp_path / "agent_state.json.v1.bak").write_text("stale backup", encoding="utf-8")

    result = _run_cli(state_file, "novel_force", tmp_path / "out", "--force")

    assert result.returncode == 0, result.stderr
    # Backup is overwritten with the current v1 payload.
    backup_text = (tmp_path / "agent_state.json.v1.bak").read_text(encoding="utf-8")
    assert backup_text != "stale backup"
    assert json.loads(backup_text)["version"] == 1
    # v2 artifacts are present.
    assert (tmp_path / "out" / "world_state" / "novel_force" / "current.json").is_file()


def test_migrate_force_re_migrates_already_v2(
    tmp_path: Path, v1_state: dict[str, Any]
) -> None:
    """``--force`` should bypass the "already v2" guard (exit 4 → 0)."""
    v2_state = _make_legacy_v1_state()
    v2_state["version"] = 2
    state_file = _write_state(tmp_path / "agent_state.json", v2_state)

    result = _run_cli(state_file, "novel_force", tmp_path / "out", "--force")
    assert result.returncode == 0, result.stderr
    # Backup holds the v2 input (which is what the user passed in as the
    # "current" state before re-migration).
    backup = json.loads(
        (tmp_path / "agent_state.json.v1.bak").read_text(encoding="utf-8")
    )
    assert backup["version"] == 2


# ---------------------------------------------------------------------------
# Cross-process reproducibility (deterministic COC seed via hashlib.md5)
# ---------------------------------------------------------------------------


def test_migrate_cross_process_reproducibility(
    tmp_path: Path, v1_state: dict[str, Any]
) -> None:
    """Run the CLI twice from independent subprocesses and verify the OC
    COC attributes are byte-identical — proving the deterministic seed
    survives PYTHONHASHSEED randomisation.
    """
    # Two separate input dirs so neither run sees the other's backup.
    in_a = tmp_path / "a"
    in_b = tmp_path / "b"
    in_a.mkdir()
    in_b.mkdir()
    state_a = _write_state(in_a / "agent_state.json", v1_state)
    state_b = _write_state(in_b / "agent_state.json", v1_state)
    out_a = tmp_path / "out_a"
    out_b = tmp_path / "out_b"

    res_a = _run_cli(state_a, "novel_repro", out_a)
    res_b = _run_cli(state_b, "novel_repro", out_b)
    assert res_a.returncode == 0, res_a.stderr
    assert res_b.returncode == 0, res_b.stderr

    oc_a = json.loads((out_a / "oc_registry" / "novel_repro.json").read_text(encoding="utf-8"))
    oc_b = json.loads((out_b / "oc_registry" / "novel_repro.json").read_text(encoding="utf-8"))

    assert set(oc_a["sheets"].keys()) == set(oc_b["sheets"].keys())
    for cid in oc_a["sheets"]:
        a_sheet = oc_a["sheets"][cid]
        b_sheet = oc_b["sheets"][cid]
        # COC attributes must be identical across processes.
        assert a_sheet["coc_attributes"] == b_sheet["coc_attributes"], (
            f"COC attributes diverged for {cid}: "
            f"{a_sheet['coc_attributes']} vs {b_sheet['coc_attributes']}"
        )
        # Derived stats derived from those rolls must match too.
        assert a_sheet["hit_points"] == b_sheet["hit_points"]
        assert a_sheet["magic_points"] == b_sheet["magic_points"]
        assert a_sheet["sanity"]["current_sanity"] == b_sheet["sanity"]["current_sanity"]
        assert a_sheet["luck"]["current"] == b_sheet["luck"]["current"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
