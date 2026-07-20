"""Tests for CEN-driven A/B sandbox forking and automatic merge."""

from __future__ import annotations

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.cen import CentralExecutiveNetwork
from src.novelist_brain.models import CharacterProjection, TickDelta, TraitVector, WorldModel
from src.novelist_brain.sandbox import MentalSandbox
from src.novelist_brain.sandbox_versioning import SandboxVersionManager


@pytest.fixture
def cen_and_sandbox() -> tuple[CentralExecutiveNetwork, MentalSandbox, BusRouter]:
    router = BusRouter()
    sandbox = MentalSandbox(
        name="mental_sandbox",
        llm_service=None,
        min_rounds=1,
        max_rounds=5,
    )
    sandbox.register(router)
    sandbox._world_model = WorldModel(
        name="test_world",
        ontology={"genre": "test", "tone": "neutral"},
        rules=["rule1"],
        current_state={"time": "morning", "mood": "calm"},
    )
    sandbox._current_scene = sandbox._create_default_scene()
    protagonist = CharacterProjection(
        id="protagonist",
        name="Lin",
        archetype="observer",
        traits=TraitVector(),
    )
    sandbox._characters.append(protagonist)
    sandbox._rebuild_character_sheets()

    cen = CentralExecutiveNetwork(name="central_executive_network")
    cen.register(router)
    version_manager = SandboxVersionManager(max_versions=4)
    cen._version_manager = version_manager
    cen._sandbox_module = sandbox
    cen._sandbox_built = True
    cen._awaiting_ready = True
    cen._narrative_ready = False
    cen._enable_ab_fork = True
    cen._ab_max_rounds = 2
    sandbox._version_manager = version_manager
    return cen, sandbox, router


class TestCenABFork:
    def test_can_run_ab_requires_version_manager(self, cen_and_sandbox: tuple) -> None:
        cen, _, _ = cen_and_sandbox
        assert cen._can_run_ab() is True
        cen._version_manager = None
        assert cen._can_run_ab() is False

    def test_first_ab_step_forks_baseline_and_alternative(
        self, cen_and_sandbox: tuple
    ) -> None:
        cen, sandbox, router = cen_and_sandbox
        cen._run_ab_step()
        assert cen._ab_in_progress is True
        assert len(cen._ab_versions) == 2
        assert cen._ab_rounds_remaining == cen._ab_max_rounds
        version_manager = cen._version_manager
        assert version_manager is not None
        a_id, b_id = cen._ab_versions
        assert a_id in version_manager.tree.versions
        assert b_id in version_manager.tree.versions
        assert sandbox.simulation_round == 0

    def test_ab_step_simulates_each_branch(self, cen_and_sandbox: tuple) -> None:
        cen, sandbox, router = cen_and_sandbox
        cen._run_ab_step()  # fork
        a_id, b_id = cen._ab_versions
        cen._run_ab_step()  # simulate one round each
        assert cen._ab_rounds_remaining == 1
        version_manager = cen._version_manager
        assert version_manager is not None
        assert version_manager.tree.versions[a_id].results
        assert version_manager.tree.versions[b_id].results

    def test_ab_completes_and_merges_winner(self, cen_and_sandbox: tuple) -> None:
        cen, sandbox, router = cen_and_sandbox
        cen._run_ab_step()  # fork
        for _ in range(cen._ab_max_rounds):
            cen._run_ab_step()
        assert cen._ab_in_progress is False
        assert len(cen._ab_versions) == 0
        assert cen._ab_rounds_remaining == 0
        version_manager = cen._version_manager
        assert version_manager is not None
        winner_id = version_manager.current_version_id
        assert winner_id is not None
        assert version_manager.tree.versions[winner_id].status == "merged"
        # Loser should be discarded.
        loser_status = {v.status for v in version_manager.tree.versions.values()}
        assert "abandoned" in loser_status

    def test_ab_emits_completed_event(self, cen_and_sandbox: tuple) -> None:
        cen, sandbox, router = cen_and_sandbox
        cen._run_ab_step()
        for _ in range(cen._ab_max_rounds):
            cen._run_ab_step()
        delivered = router.flush()
        assert any(m.topic == "data.sandbox.version.ab_completed" for m in delivered)

    def test_tick_triggers_ab_when_ready(self, cen_and_sandbox: tuple) -> None:
        cen, sandbox, router = cen_and_sandbox
        cen._state.active = True
        cen.tick(
            TickDelta(
                absolute_time=0.0,
                delta_ms=1000.0,
                phase="simulation",
            )
        )
        assert cen._ab_in_progress is True