"""Social input module for the novelist brain prototype.

This module implements Design.md §16.  It maintains the novelist's social
state—current space, role, relationships, and accumulated gaze pressure—and
generates social encounters that become experience fragments and memory traces.
"""

from __future__ import annotations

import random
import time
from typing import Any

from src.novelist_brain.models import BusMessage, Fragment, ModuleState, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict
from src.novelist_brain.social_models import (
    DEFAULT_INTRUSION_TABLE,
    DEFAULT_NPCS,
    DEFAULT_ROLES,
    DEFAULT_SOCIAL_TABLE,
    DEFAULT_SPACES,
    DialogueMode,
    EncounterType,
    GazePressure,
    Relationship,
    RelationshipDelta,
    SocialCost,
    SocialEncounter,
    SocialNPC,
    SocialRole,
    SocialSpace,
    SocialState,
)


class SocialInput(Module):
    """Generates social fragments from encounters, overheard speech, and norms.

    The module now maintains a :class:`SocialState`: the novelist moves between
    spaces, adopts roles, and accumulates gaze pressure.  Encounters are no
    longer pure random draws; they are generated from the current space, role,
    energy, and phase.  Each encounter publishes a social fragment, a metabolic
    consumption event, and (for significant encounters) a relationship delta and
    gaze-pressure reading.
    """

    BASE_ENERGY_COST: float = 1.2
    INTRUSION_CHANCE: float = 0.15

    # Phase-specific activity levels for social input.
    _PHASE_ACTIVITY: dict[str, float] = {
        "social": 1.0,
        "simulation": 0.5,
        "incubation": 0.4,
        "morning": 0.2,
        "reflection": 0.2,
        "creation": 0.1,
        "deep_night": 0.05,
    }

    # Phase-specific encounter probability multiplier.
    # ``social`` is boosted so that the short 2-hour lunch window reliably
    # produces at least one encounter for the relationship network.
    _PHASE_ENCOUNTER_MULTIPLIER: dict[str, float] = {
        "social": 5.0,
        "incubation": 1.0,
        "morning": 0.6,
        "simulation": 0.8,
        "reflection": 0.5,
        "creation": 0.3,
        "deep_night": 0.2,
    }

    # Default spaces the novelist drifts to when a phase begins.
    # This lets social encounters actually happen during the day.
    _PHASE_DEFAULT_SPACES: dict[str, list[str]] = {
        "deep_night": ["home"],
        "morning": ["home", "cafe"],
        "incubation": ["cafe", "town_square", "station"],
        "social": ["cafe", "town_square", "night_market"],
        "simulation": ["home", "cafe"],
        "reflection": ["home"],
        "creation": ["home"],
    }

    def __init__(
        self,
        name: str = "social_input",
        seed: int | None = None,
        spaces: list[SocialSpace] | None = None,
        roles: list[SocialRole] | None = None,
        npcs: list[SocialNPC] | None = None,
        social_table: list[dict[str, Any]] | None = None,
        intrusion_table: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(name)
        self._seed = seed
        self._rng = random.Random(seed)
        self._spaces: dict[str, SocialSpace] = {
            s.id: s for s in (spaces if spaces is not None else DEFAULT_SPACES)
        }
        self._roles: dict[str, SocialRole] = {
            r.id: r for r in (roles if roles is not None else DEFAULT_ROLES)
        }
        self._npcs: dict[str, SocialNPC] = {
            n.id: n for n in (npcs if npcs is not None else DEFAULT_NPCS)
        }
        self._social_table = social_table if social_table is not None else DEFAULT_SOCIAL_TABLE
        self._intrusion_table = intrusion_table if intrusion_table is not None else DEFAULT_INTRUSION_TABLE

        self._state_data = SocialState()
        self._constraints: dict[str, Any] = {}
        self._fragment_count = 0
        self._encounter_count = 0
        self._energy_cost_multiplier: float = 1.0

        self.subscribe(
            "data.identity.constraint",
            "identity.initialized",
            "identity.constraints",
            "control.module.init",
            "control.social.move",
            "control.social.switch_role",
            "control.social.export",
            "control.social.energy.budget",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "fragment_count": 0,
                "encounter_count": 0,
                "last_phase": None,
                "current_space_id": None,
                "current_role_id": None,
                "social_energy": 100.0,
                "accumulated_gaze_load": 0.0,
            },
        )

    def init(self, context: dict[str, Any]) -> None:
        """Initialize social state from agent context."""
        identity = context.get("identity", {})
        if identity:
            self._constraints = identity

        social_cfg = context.get("social", {})
        if social_cfg.get("spaces"):
            self._spaces = {
                s["id"]: SocialSpace(**s) for s in social_cfg["spaces"]
            }
        if social_cfg.get("roles"):
            self._roles = {
                r["id"]: SocialRole(**r) for r in social_cfg["roles"]
            }
        if social_cfg.get("npcs"):
            self._npcs = {
                n["id"]: SocialNPC(**n) for n in social_cfg["npcs"]
            }

        # Seed pre-existing relationships for recurring NPCs.
        # This reflects that the novelist already knows the café owner,
        # landlord, and other regulars in his social world.
        for npc in self._npcs.values():
            if npc.initial_intensity == 0.0 and npc.initial_trust == 0.0:
                continue
            self._state_data.relationships[npc.id] = Relationship(
                target_id=npc.id,
                target_name=npc.name,
                type=self._relationship_type_from_intensity(npc.initial_intensity),
                intensity=_clamp(npc.initial_intensity, -1.0, 1.0),
                trust=_clamp(npc.initial_trust, -1.0, 1.0),
                history=["seed: 已知的常客"],
            )

        # Start at home in the recluse role unless configured otherwise.
        self._state_data.current_space_id = social_cfg.get(
            "starting_space", "home"
        )
        self._state_data.current_role_id = social_cfg.get(
            "starting_role", "recluse"
        )
        self._state_data.social_energy = social_cfg.get(
            "starting_social_energy", 100.0
        )
        self._sync_state_custom()
        # Announce the initial social world so downstream modules (e.g.
        # attachment) can seed their own state from pre-existing relationships.
        if self._router is not None:
            self.emit(
                topic="data.social.state",
                payload=self._social_state_payload(),
            )

    def _social_state_payload(self) -> dict[str, Any]:
        """Build the payload for ``data.social.state`` events."""
        return {
            "relationships": {
                tid: {
                    "target_id": r.target_id,
                    "target_name": r.target_name,
                    "type": r.type,
                    "intensity": r.intensity,
                    "trust": r.trust,
                    "history": list(r.history),
                }
                for tid, r in self._state_data.relationships.items()
            },
            "gaze_pressures": [
                {
                    "source": g.source,
                    "norm": g.norm,
                    "intensity": g.intensity,
                    "internalized": g.internalized,
                }
                for g in self._state_data.gaze_pressures
            ],
            "current_space_id": self._state_data.current_space_id,
            "current_role_id": self._state_data.current_role_id,
            "social_energy": self._state_data.social_energy,
            "accumulated_gaze_load": self._state_data.accumulated_gaze_load,
            "fragment_count": self._fragment_count,
            "encounter_count": self._encounter_count,
        }

    def to_dict(self) -> dict[str, Any]:
        """Serialize social input state."""
        base = super().to_dict()
        base.update(
            {
                "seed": self._seed,
                "constraints": self._constraints,
                "npcs": {
                    nid: {
                        "id": n.id,
                        "name": n.name,
                        "space_ids": list(n.space_ids),
                        "archetype": n.archetype,
                        "initial_intensity": n.initial_intensity,
                        "initial_trust": n.initial_trust,
                        "recurrence_weight": n.recurrence_weight,
                    }
                    for nid, n in self._npcs.items()
                },
                "social_state": {
                    "current_space_id": self._state_data.current_space_id,
                    "current_role_id": self._state_data.current_role_id,
                    "relationships": {
                        tid: {
                            "target_id": r.target_id,
                            "target_name": r.target_name,
                            "type": r.type,
                            "intensity": r.intensity,
                            "trust": r.trust,
                            "history": list(r.history),
                        }
                        for tid, r in self._state_data.relationships.items()
                    },
                    "gaze_pressures": [
                        {
                            "source": g.source,
                            "norm": g.norm,
                            "intensity": g.intensity,
                            "internalized": g.internalized,
                        }
                        for g in self._state_data.gaze_pressures
                    ],
                    "recent_encounter_ids": [
                        e.id for e in self._state_data.recent_encounters
                    ],
                    "social_energy": self._state_data.social_energy,
                    "accumulated_gaze_load": self._state_data.accumulated_gaze_load,
                },
                "fragment_count": self._fragment_count,
                "encounter_count": self._encounter_count,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore social input state."""
        super().from_dict(data, **kwargs)
        self._seed = data.get("seed")
        if self._seed is not None:
            self._rng = random.Random(self._seed)
        else:
            self._rng = random.Random()
        self._constraints = data.get("constraints", {})
        self._fragment_count = data.get("fragment_count", 0)
        self._encounter_count = data.get("encounter_count", 0)
        self._npcs = {
            nid: SocialNPC(**n)
            for nid, n in data.get("npcs", {}).items()
        }

        state_data = data.get("social_state") or data.get("state", {})
        self._state_data.current_space_id = state_data.get("current_space_id")
        self._state_data.current_role_id = state_data.get("current_role_id")
        self._state_data.social_energy = state_data.get("social_energy", 100.0)
        self._state_data.accumulated_gaze_load = state_data.get(
            "accumulated_gaze_load", 0.0
        )
        self._state_data.relationships = {
            tid: Relationship(**r)
            for tid, r in state_data.get("relationships", {}).items()
        }
        self._state_data.gaze_pressures = [
            GazePressure(**g)
            for g in state_data.get("gaze_pressures", [])
        ]
        self._sync_state_custom()

    def on_bus_message(self, message: BusMessage) -> None:
        """Capture identity constraints and social control messages."""
        if message.topic in (
            "data.identity.constraint",
            "identity.initialized",
            "identity.constraints",
        ):
            payload = message.payload or {}
            constraints = payload.get("constraints") or payload
            if isinstance(constraints, dict):
                self._constraints = constraints
        elif message.topic == "control.social.move":
            self._handle_move(message.payload)
        elif message.topic == "control.social.switch_role":
            self._handle_switch_role(message.payload)
        elif message.topic == "control.social.export":
            self._handle_export(message.payload)
        elif message.topic == "control.social.energy.budget":
            self._handle_energy_budget(message.payload or {})

    def _handle_energy_budget(self, payload: dict[str, Any]) -> None:
        """Adjust social energy cost from attachment-derived control signal."""
        if payload.get("source") == "attachment":
            self._energy_cost_multiplier = float(
                payload.get("energy_cost_multiplier", 1.0)
            )

    def tick(self, delta: TickDelta) -> None:
        """Advance social simulation by one tick."""
        previous_phase = self._state.custom.get("last_phase")
        phase = delta.phase
        self._state.custom["last_phase"] = phase

        # On phase change, the novelist may drift to a space appropriate for
        # the new phase unless already in a suitable space.
        if previous_phase != phase:
            self._auto_move_for_phase(phase)

        # Recover social energy in private spaces; otherwise drain slowly.
        space = self._current_space()
        if space and space.space_type == "private":
            self._state_data.social_energy = min(
                100.0, self._state_data.social_energy + 2.0
            )
        else:
            self._state_data.social_energy = max(
                0.0, self._state_data.social_energy - 0.2
            )

        # Relationships decay over time; weak ones may be forgotten.
        self._evolve_relationships(in_private=(space is not None and space.space_type == "private"))

        activity = self._PHASE_ACTIVITY.get(phase, 0.1)
        if self._rng.random() > activity:
            self._sync_state_custom()
            return

        # Private spaces suppress encounters unless explicitly moved there.
        if phase != "social" and space and space.space_type == "private":
            if self._rng.random() > self.INTRUSION_CHANCE:
                self._sync_state_custom()
                return
            encounter = self._generate_encounter(delta.phase, delta.absolute_time)
        else:
            encounter = self._generate_encounter(delta.phase, delta.absolute_time)

        if encounter is not None:
            self._emit_encounter(encounter)

        self._sync_state_custom()

    # ------------------------------------------------------------------
    # Encounter generation
    # ------------------------------------------------------------------

    def _generate_encounter(
        self, phase: str, timestamp: float
    ) -> SocialEncounter | None:
        """Generate an encounter from current space, role, energy, and mood."""
        space = self._current_space()
        role = self._current_role()
        if space is None or role is None:
            return None

        base_rate = space.encounter_base_rate
        # Novelist observes more when open and slightly lonely.
        mood_factor = self._mood_openness() * 0.5 + self._mood_loneliness() * 0.5
        role_factor = role.encounter_affinity
        energy_factor = max(0.0, self._state_data.social_energy / 100.0)
        phase_multiplier = self._PHASE_ENCOUNTER_MULTIPLIER.get(phase, 1.0)
        probability = _clamp(
            base_rate * mood_factor * role_factor * energy_factor * phase_multiplier
        )

        if self._rng.random() > probability:
            return None

        template = self._rng.choice(self._social_table)
        encounter_type = str(template.get("encounter_type", "chance"))
        dialogue_mode = str(template.get("dialogue_mode", "surface"))
        norm_violated = bool(template.get("norm_violated", False))

        # Compute gaze pressure from space + violated norms.
        gaze = space.total_gaze()
        violated_norm = None
        if norm_violated and space.norms:
            violated_norm = self._rng.choice(space.norms)
            gaze = _clamp(gaze + violated_norm.gaze_intensity * 0.5)

        # Cost scales with role, gaze, and dialogue depth.
        cost_multiplier = role.energy_cost_multiplier
        depth_factor = {"surface": 1.0, "probe": 1.3, "confessional": 1.6}.get(
            dialogue_mode, 1.0
        )
        # Attachment-derived energy budget tunes the real metabolic cost.
        energy_drain = (
            self.BASE_ENERGY_COST
            * cost_multiplier
            * depth_factor
            * self._energy_cost_multiplier
        )
        attention_drain = gaze * 0.5
        emotional_exposure = gaze * depth_factor * 0.3
        if norm_violated:
            emotional_exposure += 0.15

        # Pick a stable target: existing relationship, recurring NPC, or stranger.
        target_id, target_name = self._pick_encounter_target(space, encounter_type)
        if encounter_type == "eavesdrop":
            participants = ["邻桌", "路人"]
        elif target_id in self._npcs:
            participants = [target_name]
        else:
            participants = [target_name]

        encounter = SocialEncounter(
            space_id=space.id,
            encounter_type=encounter_type,
            participants=participants,
            dialogue_mode=dialogue_mode,
            content=self._apply_constraints(str(template["content"])),
            valence=float(template.get("valence", 0.0)),
            arousal=float(template.get("arousal", 0.3)),
            salience=float(template.get("salience", 0.4)),
            gaze_pressure=gaze,
            cost=SocialCost(
                energy_drain=round(energy_drain, 3),
                attention_drain=round(attention_drain, 3),
                emotional_exposure=round(emotional_exposure, 3),
            ),
            timestamp=timestamp,
            tags=list(template.get("tags", ["社交"])),
        )

        # Compute relationship delta based on encounter type and valence.
        if encounter_type in ("chance", "reunion", "conflict", "help_request"):
            delta = self._compute_relationship_delta(encounter_type, encounter.valence)
            encounter.relationship_delta = RelationshipDelta(
                target_id=target_id,
                target_name=target_name,
                type=self._relationship_type(delta),
                delta=round(delta, 3),
            )

        # Register a live gaze-pressure reading.
        self._state_data.gaze_pressures.append(
            GazePressure(
                source=space.name,
                norm=violated_norm.description if violated_norm else "一般社会注视",
                intensity=gaze,
                internalized=self._rng.random() < 0.25,
            )
        )
        # Keep only recent gaze pressures to avoid unbounded growth.
        self._state_data.gaze_pressures = self._state_data.gaze_pressures[-20:]

        return encounter

    def _generate_intrusion(self, timestamp: float) -> SocialEncounter:
        """Generate a faint social intrusion, usually at home or at night."""
        template = self._rng.choice(self._intrusion_table)
        space = self._current_space()
        space_id = space.id if space else "home"
        return SocialEncounter(
            space_id=space_id,
            encounter_type=str(template.get("encounter_type", "eavesdrop")),
            participants=["未知的他人"],
            dialogue_mode=str(template.get("dialogue_mode", "surface")),
            content=self._apply_constraints(str(template["content"])),
            valence=float(template.get("valence", 0.0)),
            arousal=float(template.get("arousal", 0.3)) * 0.7,
            salience=float(template.get("salience", 0.4)) * 0.6,
            gaze_pressure=0.15,
            cost=SocialCost(
                energy_drain=0.3,
                attention_drain=0.1,
                emotional_exposure=0.05,
            ),
            timestamp=timestamp,
            tags=list(template.get("tags", ["社交", "侵入"])),
        )

    # ------------------------------------------------------------------
    # Emission
    # ------------------------------------------------------------------

    def _emit_encounter(self, encounter: SocialEncounter) -> None:
        """Publish the encounter as fragment, trace, cost, and state events."""
        self._encounter_count += 1
        self._fragment_count += 1
        self._state_data.recent_encounters.append(encounter)
        self._state_data.recent_encounters = self._state_data.recent_encounters[-50:]
        self._state_data.apply_cost(encounter.cost)

        fragment = Fragment(
            content=encounter.content,
            source="social",
            modality="dialogue" if encounter.dialogue_mode != "surface" else "event",
            valence=encounter.valence,
            arousal=encounter.arousal,
            salience=encounter.salience,
            timestamp=encounter.timestamp,
            tags=list(encounter.tags),
        )

        # 1. Legacy fragment event (kept for backward compatibility).
        self.emit(
            topic="fragment.social.new",
            payload=fragment,
            channel="data",
            priority=5,
            ttl=3,
        )

        # 2. New rich social fragment event for EOS.
        self.emit(
            topic="data.social.fragment",
            payload={
                "fragment": fragment,
                "encounter": encounter,
                "quality": encounter.salience,
                "salience": fragment.salience,
            },
            channel="data",
            priority=5,
            ttl=3,
        )

        # 3. Metabolic cost.
        self.emit(
            topic="event.module.consume",
            payload={
                "module": "social",
                "cost_type": "energy",
                "amount": encounter.cost.energy_drain,
                "reason": f"social_{encounter.encounter_type}",
            },
            channel="event",
            priority=6,
            ttl=3,
        )

        # 4. Gaze pressure event for EOS.
        self.emit(
            topic="data.social.gaze",
            payload={
                "source": encounter.space_id,
                "intensity": encounter.gaze_pressure,
                "gaze_pressure": encounter.gaze_pressure,
                "internalized": any(g.internalized for g in self._state_data.gaze_pressures[-3:]),
            },
            channel="data",
            priority=4,
            ttl=2,
        )

        # 5. Relationship update.
        if encounter.relationship_delta is not None:
            rd = encounter.relationship_delta
            is_npc = rd.target_id in self._npcs
            npc = self._npcs.get(rd.target_id)
            rel = self._state_data.relationships.setdefault(
                rd.target_id,
                Relationship(
                    target_id=rd.target_id,
                    target_name=rd.target_name,
                    type="stranger",
                    intensity=0.0,
                    trust=npc.initial_trust if npc else 0.0,
                ),
            )
            rel.intensity = _clamp(rel.intensity + rd.delta, -1.0, 1.0)
            # Trust moves in the same direction as intensity, but slower.
            if rd.delta > 0:
                rel.trust = _clamp(rel.trust + rd.delta * 0.5)
            elif rd.delta < 0:
                rel.trust = _clamp(rel.trust + rd.delta * 0.3)
            rel.type = self._relationship_type_from_intensity(rel.intensity)
            rel.history.append(f"{encounter.encounter_type}: {encounter.content[:40]}")
            rel.history = rel.history[-10:]
            self.emit(
                topic="data.social.relationship.delta",
                payload={
                    "relationship": rel,
                    "delta": rd.delta,
                    "source": self.name,
                },
                channel="data",
                priority=4,
                ttl=2,
            )

        # 6. Social state broadcast.
        payload = self._social_state_payload()
        payload.update(
            {
                "latest_fragment": fragment,
                "latest_encounter": encounter,
                "energy_cost": encounter.cost.energy_drain,
                "gaze_pressure": encounter.gaze_pressure,
                "intensity": encounter.gaze_pressure,
                "constraints_applied": bool(self._constraints),
            }
        )
        self.emit(
            topic="data.social.state",
            payload=payload,
            channel="data",
            priority=4,
            ttl=2,
        )

        # 7. Social trace marker for memory system.
        self.emit(
            topic="data.social.trace",
            payload={
                "space_id": encounter.space_id,
                "role_id": self._state_data.current_role_id,
                "relationship_delta": encounter.relationship_delta,
                "gaze_pressure": encounter.gaze_pressure,
                "dialogue_mode": encounter.dialogue_mode,
                "fragment": fragment,
                "source": self.name,
            },
            channel="data",
            priority=4,
            ttl=2,
        )

        if fragment.tags and "norm" in fragment.tags:
            self.emit(
                topic="event.social.norm.violated",
                payload={
                    "fragment": fragment,
                    "description": fragment.content,
                    "severity": abs(fragment.valence) + fragment.arousal,
                },
                channel="event",
                priority=6,
                ttl=3,
            )

    # ------------------------------------------------------------------
    # Control handlers
    # ------------------------------------------------------------------

    def _handle_move(self, payload: Any) -> None:
        """Move the novelist to a different social space."""
        if not isinstance(payload, dict):
            return
        space_id = payload.get("space_id")
        if space_id in self._spaces:
            self._state_data.current_space_id = space_id
            # Auto-switch to a valid role for this space.
            valid_roles = [
                r for r in self._roles.values() if space_id in r.space_ids
            ]
            if valid_roles:
                self._state_data.current_role_id = self._rng.choice(
                    valid_roles
                ).id

    def _handle_switch_role(self, payload: Any) -> None:
        """Switch the novelist's social role."""
        if not isinstance(payload, dict):
            return
        role_id = payload.get("role_id")
        if role_id in self._roles:
            self._state_data.current_role_id = role_id

    def _auto_move_for_phase(self, phase: str) -> None:
        """Drift to a space appropriate for the new phase.

        If the current space is already among the phase defaults, stay.
        Otherwise pick a default space and a valid role for it. This gives
        the relationship network a chance to activate during the day.
        """
        defaults = self._PHASE_DEFAULT_SPACES.get(phase)
        if not defaults:
            return
        current_space = self._current_space()
        if current_space is not None and current_space.id in defaults:
            return
        candidates = [sid for sid in defaults if sid in self._spaces]
        if not candidates:
            return
        space_id = self._rng.choice(candidates)
        valid_roles = [r for r in self._roles.values() if space_id in r.space_ids]
        role_id = (
            self._rng.choice(valid_roles).id
            if valid_roles
            else self._state_data.current_role_id
        )
        self._state_data.current_space_id = space_id
        if role_id:
            self._state_data.current_role_id = role_id

    def _handle_export(self, payload: Any) -> None:
        """Emit a rich social-space visualization payload on demand."""
        options = payload if isinstance(payload, dict) else {}
        include_history = bool(options.get("include_history", True))
        max_encounters = int(options.get("max_encounters", 50))
        max_gaze = int(options.get("max_gaze", 50))
        target_topic = str(options.get("target_topic", "data.social.export"))

        self.emit(
            topic=target_topic,
            payload=self.visualize_state(
                include_history=include_history,
                max_encounters=max_encounters,
                max_gaze=max_gaze,
            ),
            channel="data",
            priority=4,
            ttl=5,
        )

    def visualize_state(
        self,
        include_history: bool = True,
        max_encounters: int = 50,
        max_gaze: int = 50,
    ) -> dict[str, Any]:
        """Return a JSON-serializable snapshot of the social world.

        This is intended for debugging, dashboards, and audit logs. It keeps
        dataclass instances out of the returned dictionary so callers can pass
        it directly to ``json.dumps``.
        """
        current_space = self._current_space()
        current_role = self._current_role()

        relationships = []
        for rel in self._state_data.relationships.values():
            rel_dict = dataclass_to_dict(rel)
            if not include_history:
                rel_dict.pop("history", None)
            relationships.append(rel_dict)

        gaze_pressures = [
            dataclass_to_dict(g)
            for g in self._state_data.gaze_pressures[-max_gaze:]
        ]

        recent_encounters = [
            dataclass_to_dict(e)
            for e in self._state_data.recent_encounters[-max_encounters:]
        ]

        space_list = [dataclass_to_dict(s) for s in self._spaces.values()]
        role_list = [dataclass_to_dict(r) for r in self._roles.values()]
        npc_list = [dataclass_to_dict(n) for n in self._npcs.values()]

        total_gaze_load = self._state_data.accumulated_gaze_load
        current_space_gaze = (
            current_space.total_gaze() if current_space is not None else 0.0
        )

        return {
            "module": self.name,
            "timestamp": time.time(),
            "current": {
                "space": dataclass_to_dict(current_space) if current_space else None,
                "role": dataclass_to_dict(current_role) if current_role else None,
                "space_gaze": round(current_space_gaze, 4),
                "social_energy": round(self._state_data.social_energy, 4),
                "accumulated_gaze_load": round(total_gaze_load, 4),
                "energy_ratio": round(
                    max(0.0, self._state_data.social_energy) / 100.0, 4
                ),
            },
            "spaces": space_list,
            "roles": role_list,
            "npcs": npc_list,
            "relationships": relationships,
            "gaze_pressures": gaze_pressures,
            "recent_encounters": recent_encounters,
            "summary": {
                "fragment_count": self._fragment_count,
                "encounter_count": self._encounter_count,
                "relationship_count": len(relationships),
                "gaze_pressure_count": len(gaze_pressures),
                "recent_encounter_count": len(recent_encounters),
                "spaces_count": len(space_list),
                "roles_count": len(role_list),
                "npcs_count": len(npc_list),
            },
        }

    # ------------------------------------------------------------------
    # Per-NPC detail accessors (added for WebUI Phase 3 NPC details panel)
    # ------------------------------------------------------------------

    def get_npc(self, npc_id: str) -> dict[str, Any] | None:
        """Return static metadata + runtime relationship for a single NPC.

        Returns ``None`` if the NPC id is unknown. The ``relationship`` field
        is ``None`` when no encounter has yet produced a relationship delta
        for this NPC.
        """
        npc = self._npcs.get(npc_id)
        if npc is None:
            return None
        rel = self._state_data.relationships.get(npc_id)
        # Count encounters that touched this NPC (only those with a
        # relationship_delta carry the target_id; eavesdrop/intrusion do not).
        encounter_count = sum(
            1
            for e in self._state_data.recent_encounters
            if e.relationship_delta is not None
            and e.relationship_delta.target_id == npc_id
        )
        last_seen_ts: float | None = None
        for e in reversed(self._state_data.recent_encounters):
            if (
                e.relationship_delta is not None
                and e.relationship_delta.target_id == npc_id
            ):
                last_seen_ts = e.timestamp
                break
        return {
            "npc": dataclass_to_dict(npc),
            "relationship": dataclass_to_dict(rel) if rel is not None else None,
            "encounter_count": encounter_count,
            "last_seen_timestamp": last_seen_ts,
        }

    def get_npc_encounters(self, npc_id: str, limit: int = 50) -> list[dict[str, Any]]:
        """Return recent encounters involving ``npc_id``, newest first.

        Only encounters with a ``relationship_delta.target_id`` matching the
        NPC are returned. Encounters of type ``eavesdrop`` / ``intrusion`` do
        not carry a target_id and therefore cannot be attributed to a single
        NPC with the current data model.
        """
        if npc_id not in self._npcs:
            return []
        out: list[dict[str, Any]] = []
        for e in self._state_data.recent_encounters:
            if (
                e.relationship_delta is not None
                and e.relationship_delta.target_id == npc_id
            ):
                out.append(dataclass_to_dict(e))
        out.reverse()  # newest first
        if limit > 0:
            out = out[:limit]
        return out

    def get_encounter(self, encounter_id: str) -> dict[str, Any] | None:
        """Return a single encounter by id, or ``None`` if not in the buffer."""
        for e in self._state_data.recent_encounters:
            if e.id == encounter_id:
                return dataclass_to_dict(e)
        return None

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _current_space(self) -> SocialSpace | None:
        return self._spaces.get(self._state_data.current_space_id)

    def _current_role(self) -> SocialRole | None:
        return self._roles.get(self._state_data.current_role_id)

    def _mood_openness(self) -> float:
        traits = self._constraints.get("traits", {})
        return float(traits.get("开放性", 0.5))

    def _mood_loneliness(self) -> float:
        # loneliness is approximated by high introversion + neuroticism.
        traits = self._constraints.get("traits", {})
        introversion = float(traits.get("内倾性", 0.5))
        neuroticism = float(traits.get("神经质", 0.5))
        return _clamp((introversion + neuroticism) / 2.0)

    def _relationship_type(self, delta: float) -> RelationshipType:
        return self._relationship_type_from_intensity(delta)

    def _relationship_type_from_intensity(self, intensity: float) -> RelationshipType:
        """Map a relationship intensity value to a categorical type."""
        if intensity <= -0.25:
            return "antagonist"
        if intensity <= -0.08:
            return "rival"
        if intensity < 0.08:
            return "stranger"
        if intensity < 0.25:
            return "acquaintance"
        if intensity < 0.55:
            return "friend"
        return "intimate"

    def _pick_encounter_target(
        self, space: SocialSpace, encounter_type: str
    ) -> tuple[str, str]:
        """Choose a stable target for the encounter.

        Reunion strongly favors existing relationships; conflict and help
        requests can target anyone in the space; chance encounters balance
        between strangers, NPCs, and existing relationships weighted by
        intensity and recurrence.
        """
        space_id = space.id
        existing = [
            (tid, rel)
            for tid, rel in self._state_data.relationships.items()
            if rel.target_id in self._npcs
            and self._npcs[rel.target_id].can_appear_in(space_id)
        ]
        present_npcs = [
            (nid, npc) for nid, npc in self._npcs.items() if npc.can_appear_in(space_id)
        ]

        # Reunion: prefer someone we already know in this space.
        if encounter_type == "reunion" and existing:
            weights = [max(0.05, rel.intensity + 0.5) for _, rel in existing]
            total = sum(weights)
            pick = self._rng.random() * total
            cumulative = 0.0
            for (tid, rel), weight in zip(existing, weights):
                cumulative += weight
                if pick <= cumulative:
                    return tid, rel.target_name
            return existing[-1][0], existing[-1][1].target_name

        # Conflict can also dredge up an existing antagonist/rival.
        if encounter_type == "conflict" and existing:
            negative = [
                (tid, rel) for tid, rel in existing if rel.intensity < 0
            ]
            if negative and self._rng.random() < 0.6:
                tid, rel = self._rng.choice(negative)
                return tid, rel.target_name

        # Weighted lottery among strangers, NPCs, and existing relationships.
        stranger_weight = 1.0
        npc_weight = sum(
            max(0.1, npc.recurrence_weight) for _, npc in present_npcs
        )
        existing_weight = sum(
            max(0.05, rel.intensity + 0.5) for _, rel in existing
        )

        total_weight = stranger_weight + npc_weight + existing_weight
        if total_weight <= 0:
            return "stranger- passerby", "陌生人"

        pick = self._rng.random() * total_weight
        if pick < stranger_weight:
            stranger_pool = ["路人", "陌生人", "过客", "邻座的人"]
            name = self._rng.choice(stranger_pool)
            return f"stranger-{name}-{self._rng.randint(1, 9999)}", name

        pick -= stranger_weight
        if present_npcs and pick < npc_weight:
            weights = [max(0.1, npc.recurrence_weight) for _, npc in present_npcs]
            npc_total = sum(weights)
            inner = self._rng.random() * npc_total
            cumulative = 0.0
            for (nid, npc), weight in zip(present_npcs, weights):
                cumulative += weight
                if inner <= cumulative:
                    return nid, npc.name
            return present_npcs[-1][0], present_npcs[-1][1].name

        # Existing relationship.
        if existing:
            weights = [max(0.05, rel.intensity + 0.5) for _, rel in existing]
            rel_total = sum(weights)
            inner = self._rng.random() * rel_total
            cumulative = 0.0
            for (tid, rel), weight in zip(existing, weights):
                cumulative += weight
                if inner <= cumulative:
                    return tid, rel.target_name
            return existing[-1][0], existing[-1][1].target_name

        # Fallback to stranger if no NPCs or relationships.
        name = self._rng.choice(["路人", "陌生人", "过客"])
        return f"stranger-{name}-{self._rng.randint(1, 9999)}", name

    def _compute_relationship_delta(
        self, encounter_type: str, valence: float
    ) -> float:
        """Return an intensity delta appropriate for the encounter."""
        if encounter_type == "conflict":
            return round(-0.08 - self._rng.random() * 0.12, 3)
        if encounter_type == "reunion":
            return round(0.05 + self._rng.random() * 0.1, 3)
        if encounter_type == "help_request":
            return round(0.05 + self._rng.random() * 0.08, 3)
        # chance
        base = self._rng.choice([-0.05, -0.02, 0.02, 0.05, 0.08])
        # Valence nudges the delta.
        return round(_clamp(base + valence * 0.05, -0.15, 0.15), 3)

    def _evolve_relationships(self, in_private: bool) -> None:
        """Decay relationships over time and forget very weak ones.

        Pre-seeded relationships (history only contains ``seed:*`` entries)
        are left stable until the novelist actually encounters the NPC.
        This prevents the social world from collapsing to strangers after
        a single day of low interaction.
        """
        decay_rate = 0.002 if in_private else 0.005
        to_forget: list[str] = []
        for tid, rel in self._state_data.relationships.items():
            is_dormant_seed = (
                rel.history and all(h.startswith("seed:") for h in rel.history)
            )
            if is_dormant_seed:
                # Pre-seeded acquaintance stays dormant until first real contact.
                continue

            # Small drift toward neutral.
            if rel.intensity > 0:
                rel.intensity = max(0.0, rel.intensity - decay_rate)
            elif rel.intensity < 0:
                rel.intensity = min(0.0, rel.intensity + decay_rate)

            # Trust slowly aligns with intensity.
            target_trust = _clamp(rel.intensity)
            if rel.trust < target_trust:
                rel.trust = min(target_trust, rel.trust + decay_rate)
            elif rel.trust > target_trust:
                rel.trust = max(target_trust, rel.trust - decay_rate)

            # Update type based on current intensity.
            rel.type = self._relationship_type_from_intensity(rel.intensity)

            # Forget very weak, old relationships with short history.
            if abs(rel.intensity) < 0.03 and len(rel.history) <= 2:
                to_forget.append(tid)

        for tid in to_forget:
            self._state_data.relationships.pop(tid, None)

    def _apply_constraints(self, content: str) -> str:
        """Optionally flavor social content with identity values or interests."""
        if not self._constraints:
            return content

        interests = self._constraints.get("interests", [])
        values = self._constraints.get("values", [])
        anchors = self._constraints.get("anchors", {})
        anchor_places = (
            anchors.get("places", [])
            if isinstance(anchors, dict)
            else []
        )
        if not interests and not values and not anchor_places:
            return content

        if self._rng.random() < 0.2 and anchor_places:
            place = self._rng.choice(anchor_places)
            return f"{content}（这发生在{place}附近）"
        if self._rng.random() < 0.2 and interests:
            interest = self._rng.choice(interests)
            return f"{content}（我透过{interest}的棱镜看着这一幕）"
        if self._rng.random() < 0.1 and values:
            value = self._rng.choice(values)
            return f"{content}［{value}］"
        return content

    def _sync_state_custom(self) -> None:
        self._state.custom.update(
            {
                "fragment_count": self._fragment_count,
                "encounter_count": self._encounter_count,
                "current_space_id": self._state_data.current_space_id,
                "current_role_id": self._state_data.current_role_id,
                "social_energy": self._state_data.social_energy,
                "accumulated_gaze_load": self._state_data.accumulated_gaze_load,
            }
        )


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))