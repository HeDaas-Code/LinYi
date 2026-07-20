"""Tests for the socialization model, social input, TRPG mechanics and sandbox integration."""

from __future__ import annotations

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.eos import SocialCollector
from src.novelist_brain.models import BusMessage, CharacterProjection, GlobalContext, TickDelta, TraitVector
from src.novelist_brain.sandbox import MentalSandbox
from src.novelist_brain.social_input import SocialInput
from src.novelist_brain.social_models import (
    DEFAULT_SPACES,
    GazePressure,
    Norm,
    Relationship,
    RelationshipDelta,
    SocialCost,
    SocialEncounter,
    SocialRole,
    SocialSpace,
    SocialState,
)
from src.novelist_brain.trpg import (
    GameMaster,
    SkillCheckOutcome,
    TRPGCharacterSheet,
    build_character_sheet,
    build_narrative_line,
    emotional_shift_for_outcome,
    projection_ratio_for_archetype,
    resolve_skill_check,
    roll_d100,
)


def _make_tick_delta(phase: str = "morning", tick: int = 1) -> TickDelta:
    return TickDelta(
        absolute_time=tick * 1000.0,
        delta_ms=1000.0,
        phase=phase,
        global_context=GlobalContext(
            tick=tick,
            absolute_time=tick * 1000.0,
            phase=phase,
            active_network=None,
            budget_warning=False,
        ),
    )


def test_social_space_total_gaze() -> None:
    space = SocialSpace(
        id="test",
        name="测试空间",
        gaze_intensity=0.4,
        norms=[
            Norm(description="保持安静", gaze_intensity=0.2),
            Norm(description="不要注视", gaze_intensity=0.3),
        ],
    )
    assert space.total_gaze() == 0.45


def test_social_state_apply_cost() -> None:
    state = SocialState(social_energy=100.0, accumulated_gaze_load=0.0)
    state.apply_cost(SocialCost(energy_drain=10.0, attention_drain=0.2, emotional_exposure=0.3))
    assert state.social_energy == 90.0
    assert state.accumulated_gaze_load == 0.3


def test_relationship_can_shift() -> None:
    rel = Relationship(target_id="t1", target_name="路人", type="stranger", intensity=0.5)
    assert rel.can_shift(RelationshipDelta(delta=0.4))
    assert not rel.can_shift(RelationshipDelta(delta=0.6))


def test_social_input_initialization() -> None:
    router = BusRouter()
    social = SocialInput(name="social_input", seed=42)
    social.register(router)

    context = {
        "identity": {
            "traits": {"开放性": 0.8, "内倾性": 0.7, "神经质": 0.5},
            "interests": ["城市", "雨"],
        },
        "social": {
            "starting_space": "home",
            "starting_role": "recluse",
            "starting_social_energy": 100.0,
            "fatigue_rate": 1.2,
        },
    }
    social.init(context)

    assert social._state_data.current_space_id == "home"
    assert social._state_data.current_role_id == "recluse"
    assert social._state_data.social_energy == 100.0


def test_social_input_emits_fragment_and_gaze() -> None:
    router = BusRouter()
    social = SocialInput(name="social_input", seed=1)
    social.register(router)

    context = {
        "identity": {
            "traits": {"开放性": 0.9, "内倾性": 0.3, "神经质": 0.5},
            "interests": ["城市"],
        },
        "social": {
            "starting_space": "town_square",
            "starting_role": "observer",
            "starting_social_energy": 100.0,
            "fatigue_rate": 1.2,
        },
    }
    social.init(context)

    # Force an encounter by ticking in the social phase many times.
    emitted_topics: list[str] = []
    original_route = router.route

    def capturing_route(message: BusMessage):
        emitted_topics.append(message.topic)
        return original_route(message)

    router.route = capturing_route  # type: ignore[method-assign]

    for _ in range(50):
        social.tick(_make_tick_delta(phase="social"))
        router.flush()

    assert "fragment.social.new" in emitted_topics
    assert "data.social.fragment" in emitted_topics
    assert "data.social.gaze" in emitted_topics
    assert "data.social.state" in emitted_topics


def test_social_input_roundtrip() -> None:
    router = BusRouter()
    social = SocialInput(name="social_input", seed=42)
    social.register(router)

    context = {
        "identity": {"traits": {"开放性": 0.8}},
        "social": {"starting_space": "cafe", "starting_role": "regular", "starting_social_energy": 80.0},
    }
    social.init(context)
    social.tick(_make_tick_delta(phase="social"))
    router.flush()

    snapshot = social.to_dict()
    restored = SocialInput(name="social_input", seed=42)
    restored.register(router)
    restored.from_dict(snapshot)

    assert restored._state_data.current_space_id == social._state_data.current_space_id
    assert restored._state_data.current_role_id == social._state_data.current_role_id
    assert restored._state_data.social_energy == social._state_data.social_energy
    assert restored._state.active is True
    assert restored._state.custom is not None


def test_resolve_skill_check_boundaries() -> None:
    # Use a deterministic RNG so outcomes are predictable.
    class FakeRNG:
        def __init__(self, value: int) -> None:
            self.value = value

        def randint(self, a: int, b: int) -> int:
            return self.value

    # High skill + low roll => critical success.
    roll, target, outcome = resolve_skill_check(50.0, modifier=100.0, difficulty=1.0, rng=FakeRNG(3))
    assert target == 99.0
    assert outcome == SkillCheckOutcome.CRITICAL_SUCCESS
    # Low skill + high roll => fumble.
    roll, target, outcome = resolve_skill_check(1.0, modifier=-100.0, difficulty=1.0, rng=FakeRNG(96))
    assert target == 1.0
    assert outcome == SkillCheckOutcome.FUMBLE


def test_roll_d100_range() -> None:
    for _ in range(100):
        assert 1 <= roll_d100() <= 100


def test_skill_sheet_skill_value() -> None:
    sheet = TRPGCharacterSheet(
        character_id="c1",
        name="测试角色",
        attributes={"pow": 12, "int": 14},
        skills={"观察": 40.0},
    )
    assert sheet.skill_value("观察") == 40.0
    # Derived from attributes when absent.
    assert sheet.skill_value("心理学") == 52.0


def test_build_character_sheet() -> None:
    projection = CharacterProjection(
        name="林逸",
        archetype="主角：小说家",
        traits=TraitVector(openness=0.8, neuroticism=0.5),
        projection_ratio=0.85,
    )
    sheet = build_character_sheet(projection)
    assert sheet.name == "林逸"
    assert sheet.projection_ratio == 0.85
    assert sheet.skills["观察"] == 25.0
    assert all(attr in sheet.attributes for attr in ["str", "con", "dex", "int", "pow", "app", "edu", "siz"])


def test_gm_resolution_updates_sheet() -> None:
    projection = CharacterProjection(name="主角", archetype="主角")
    sheet = build_character_sheet(projection)
    gm = GameMaster(rng=__import__("random").Random(1))
    scene = __import__("src.novelist_brain.models", fromlist=["Scene"]).Scene(description="测试场景", setting="站台")

    resolution = gm.resolve_round("观察人群", sheet, scene=scene)
    assert resolution.check.outcome in SkillCheckOutcome
    assert resolution.check.roll >= 1
    assert resolution.emotional_shift is not None
    assert isinstance(resolution.narration, str)


def test_emotional_shift_for_outcome() -> None:
    assert emotional_shift_for_outcome(SkillCheckOutcome.CRITICAL_SUCCESS) > 0
    assert emotional_shift_for_outcome(SkillCheckOutcome.FUMBLE) < 0


def test_projection_ratio_for_archetype() -> None:
    assert projection_ratio_for_archetype("主角") == 0.85
    assert projection_ratio_for_archetype("配角") == 0.35
    assert 0.0 < projection_ratio_for_archetype("路人") < 1.0


def test_build_narrative_line() -> None:
    scene = __import__("src.novelist_brain.models", fromlist=["Scene"]).Scene(
        description="开端", setting="街道", conflict_level=0.2
    )
    check = __import__("src.novelist_brain.trpg", fromlist=["SkillCheck"]).SkillCheck(
        character_name="林逸",
        skill="观察",
        outcome=SkillCheckOutcome.CRITICAL_SUCCESS,
    )
    line = build_narrative_line([scene], [check])
    assert len(line.scenes) == 1
    assert line.climax == scene
    assert any("观察" in c.stakes for c in line.conflicts)


def test_sandbox_builds_character_sheets() -> None:
    router = BusRouter()
    sandbox = MentalSandbox(name="sandbox", llm_service=__import__("src.novelist_brain.llm", fromlist=["MockLLMService"]).MockLLMService(seed=1))
    sandbox.register(router)
    context = {
        "identity": {
            "name": "林逸",
            "traits": {"开放性": 0.8, "内倾性": 0.7, "神经质": 0.5, "尽责性": 0.6, "敏感性": 0.8},
        },
        "sandbox": {
            "min_rounds": 1,
            "max_rounds": 3,
            "seed": 1,
            "world": {
                "name": "脑中世界",
                "ontology": {"genre": "严肃文学", "tone": "忧郁"},
                "rules": ["行动有情感后果"],
            },
        },
    }
    sandbox.init(context)

    assert len(sandbox.characters) >= 1
    protagonist = next(c for c in sandbox.characters if c.name == "林逸")
    assert protagonist.id in sandbox._character_sheets
    sheet = sandbox._character_sheets[protagonist.id]
    assert isinstance(sheet, TRPGCharacterSheet)


def test_sandbox_simulate_uses_skill_check() -> None:
    router = BusRouter()
    sandbox = MentalSandbox(name="sandbox", llm_service=__import__("src.novelist_brain.llm", fromlist=["MockLLMService"]).MockLLMService(seed=1))
    sandbox.register(router)
    context = {
        "identity": {
            "name": "林逸",
            "traits": {"开放性": 0.8, "内倾性": 0.7, "神经质": 0.5, "尽责性": 0.6, "敏感性": 0.8},
        },
        "sandbox": {
            "min_rounds": 1,
            "max_rounds": 3,
            "seed": 1,
            "world": {
                "name": "脑中世界",
                "ontology": {"genre": "严肃文学", "tone": "忧郁"},
                "rules": ["行动有情感后果"],
            },
        },
    }
    sandbox.init(context)

    router.publish(
        source="test",
        topic="control.sandbox.simulate",
        channel="control",
        payload={"action": "观察人群"},
    )
    router.flush()

    assert sandbox.simulation_round >= 1
    assert len(sandbox._skill_checks) >= 1
    assert sandbox._skill_checks[-1].outcome in SkillCheckOutcome


def test_eos_social_collector_ingests_real_events() -> None:
    collector = SocialCollector()
    fragment_event = BusMessage(
        source="social_input",
        topic="data.social.fragment",
        channel="data",
        payload={"salience": 0.7, "quality": 0.8},
    )
    gaze_event = BusMessage(
        source="social_input",
        topic="data.social.gaze",
        channel="data",
        payload={"intensity": 0.6},
    )
    collector.ingest(fragment_event)
    collector.ingest(gaze_event)

    window = {"start": 0, "end": 1000}
    metrics = collector.aggregate(window)
    metric_ids = {m.id for m in metrics}
    assert "social_health" in metric_ids
    assert "gaze_load" in metric_ids
    assert "social_fragment_quality" in metric_ids

    health_metric = next(m for m in metrics if m.id == "social_health")
    assert health_metric.value > 0.0


if __name__ == "__main__":
    test_social_space_total_gaze()
    test_social_state_apply_cost()
    test_relationship_can_shift()
    test_social_input_initialization()
    test_social_input_emits_fragment_and_gaze()
    test_social_input_roundtrip()
    test_resolve_skill_check_boundaries()
    test_roll_d100_range()
    test_skill_sheet_skill_value()
    test_build_character_sheet()
    test_gm_resolution_updates_sheet()
    test_emotional_shift_for_outcome()
    test_projection_ratio_for_archetype()
    test_build_narrative_line()
    test_sandbox_builds_character_sheets()
    test_sandbox_simulate_uses_skill_check()
    test_eos_social_collector_ingests_real_events()
    print("social/trpg tests passed")