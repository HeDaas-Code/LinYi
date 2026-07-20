"""Data-driven TRPG rulebook for the mental sandbox (Design.md §17).

This module turns the hard-coded COC-style adjudication into a configurable
rulebook.  A rulebook defines skills, actions, combat/chase rules, sanity
rules, skill improvement, items, mythos tomes and campaign arcs.  The
``GameMaster`` consumes a ``Rulebook`` instance so that advanced mechanics can
be switched on/off or replaced without changing core code.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class SkillDef:
    """Definition of a TRPG skill."""

    name: str
    base_value: float = 0.0
    attributes: list[str] = field(default_factory=list)
    description: str = ""
    tags: list[str] = field(default_factory=list)


@dataclass
class ActionDef:
    """Mapping from plain-language action to a skill and default difficulty."""

    name: str
    skill: str = ""
    keywords: list[str] = field(default_factory=list)
    difficulty: float = 1.0
    default_modifier: float = 0.0


@dataclass
class CombatRule:
    """Rules for a single round of narrative combat."""

    name: str = "standard"
    attack_skill: str = "格斗"
    dodge_skill: str = "闪避"
    damage_formula: str = "1d6+db"
    critical_multiplier: float = 2.0
    impale_threshold: float = 0.2
    # Optional cap on number of combatants per side.
    max_combatants: int = 6


@dataclass
class SanityRule:
    """Rules governing sanity loss and insanity."""

    enabled: bool = True
    fumble_shock_range: tuple[float, float] = (5.0, 10.0)
    fear_shock_threshold: float = 0.5
    fear_shock_probability: float = 0.25
    phobia_chance: float = 0.3
    indefinite_insanity_threshold: float = 0.0
    permanent_insanity_threshold: float = 0.0


@dataclass
class ImprovementRule:
    """Rules for skill improvement after a successful/failed check."""

    enabled: bool = True
    success_improvement_chance: float = 0.0
    failure_improvement_chance: float = 0.5
    improvement_die: str = "1d10"
    max_improvement_per_skill: int = 5


@dataclass
class ItemDef:
    """Definition of an equippable/usable item."""

    id: str = ""
    name: str = ""
    category: str = "general"  # weapon, tool, tome, consumable, clue
    description: str = ""
    skill_bonus: dict[str, float] = field(default_factory=dict)
    sanity_cost: float = 0.0
    uses: int | None = None
    effects: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class MythosTome:
    """A mythos tome that can teach spells at a sanity cost."""

    id: str = ""
    name: str = ""
    mythos_rating: float = 0.0
    spells: list[str] = field(default_factory=list)
    sanity_cost_first_read: float = 1.0
    sanity_cost_study: float = 2.0
    cthulhu_mythos_bonus: float = 1.0


@dataclass
class CampaignArcTemplate:
    """Template for a multi-scene campaign arc."""

    id: str = ""
    name: str = ""
    stages: list[dict[str, Any]] = field(default_factory=list)
    required_themes: list[str] = field(default_factory=list)
    climax_condition: str = ""


class Rulebook:
    """Configurable rulebook consumed by ``GameMaster``.

    The rulebook can be loaded from a plain dictionary (usually read from
    ``default.config.json`` or a separate JSON/YAML file).  Unknown keys are
    ignored so that future extensions do not break existing configurations.
    """

    def __init__(self, data: dict[str, Any] | None = None) -> None:
        data = data or {}
        self.name: str = data.get("name", "COC")
        self.version: str = data.get("version", "1.0")

        self.skills: dict[str, SkillDef] = {}
        for skill_data in data.get("skills", []):
            skill = SkillDef(**skill_data) if isinstance(skill_data, dict) else skill_data
            self.skills[skill.name] = skill

        self.actions: list[ActionDef] = []
        for action_data in data.get("actions", []):
            action = ActionDef(**action_data) if isinstance(action_data, dict) else action_data
            self.actions.append(action)

        combat_data = data.get("combat", {})
        self.combat = CombatRule(**combat_data) if isinstance(combat_data, dict) else CombatRule()

        sanity_data = data.get("sanity", {})
        self.sanity = SanityRule(**sanity_data) if isinstance(sanity_data, dict) else SanityRule()

        improvement_data = data.get("improvement", {})
        self.improvement = (
            ImprovementRule(**improvement_data)
            if isinstance(improvement_data, dict)
            else ImprovementRule()
        )

        self.items: dict[str, ItemDef] = {}
        for item_data in data.get("items", []):
            item = ItemDef(**item_data) if isinstance(item_data, dict) else item_data
            self.items[item.id or item.name] = item

        self.tomes: dict[str, MythosTome] = {}
        for tome_data in data.get("tomes", []):
            tome = MythosTome(**tome_data) if isinstance(tome_data, dict) else tome_data
            self.tomes[tome.id or tome.name] = tome

        self.campaign_arcs: dict[str, CampaignArcTemplate] = {}
        for arc_data in data.get("campaign_arcs", []):
            arc = CampaignArcTemplate(**arc_data) if isinstance(arc_data, dict) else arc_data
            self.campaign_arcs[arc.id or arc.name] = arc

        self.metadata: dict[str, Any] = dict(data.get("metadata", {}))

    def skill_for_action(self, action: str) -> ActionDef:
        """Return the best matching action definition for a plain-language action."""
        action_lower = action.lower()
        for act in self.actions:
            if act.name.lower() == action_lower:
                return act
            if any(keyword in action_lower for keyword in act.keywords):
                return act
        # Fallback: try to find a skill whose name appears in the action.
        for skill_name in self.skills:
            if skill_name.lower() in action_lower:
                return ActionDef(name=action, skill=skill_name)
        return ActionDef(name=action, skill="")

    def base_value_for_skill(self, skill_name: str) -> float:
        """Return the configured base value for a skill, or 0.0 if unknown."""
        return self.skills.get(skill_name, SkillDef(name=skill_name)).base_value

    def __contains__(self, name: str) -> bool:
        """Return True if ``name`` is a known skill or action name."""
        key = name.lower()
        if key in {s.lower() for s in self.skills}:
            return True
        return any(a.name.lower() == key for a in self.actions)

    def items_for_category(self, category: str) -> list[ItemDef]:
        """Return all item definitions matching ``category``."""
        return [item for item in self.items.values() if item.category == category]

    def validate(self) -> list[str]:
        """Validate the rulebook and return a list of human-readable errors."""
        errors: list[str] = []
        if not self.skills:
            errors.append("rulebook has no skills defined")
        if not self.actions:
            errors.append("rulebook has no actions defined")
        if not _is_valid_die_formula(self.combat.damage_formula):
            errors.append(
                f"combat.damage_formula '{self.combat.damage_formula}' is not a valid die formula"
            )
        return errors

    @classmethod
    def from_file(cls, path: str | os.PathLike[str]) -> Rulebook:
        """Load a rulebook from a JSON or YAML file."""
        path = Path(path)
        suffix = path.suffix.lower()
        if suffix in (".yaml", ".yml"):
            try:
                import yaml
            except ImportError as exc:
                raise ImportError(
                    "PyYAML is required to load YAML rulebook files. "
                    "Install it or use JSON rulebook files."
                ) from exc
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        else:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        if not isinstance(data, dict):
            data = {}
        return cls(data)

    def to_dict(self) -> dict[str, Any]:
        """Serialize the rulebook to a plain dictionary."""
        return {
            "name": self.name,
            "version": self.version,
            "skills": [
                {
                    "name": s.name,
                    "base_value": s.base_value,
                    "attributes": s.attributes,
                    "description": s.description,
                    "tags": s.tags,
                }
                for s in self.skills.values()
            ],
            "actions": [
                {
                    "name": a.name,
                    "skill": a.skill,
                    "keywords": a.keywords,
                    "difficulty": a.difficulty,
                    "default_modifier": a.default_modifier,
                }
                for a in self.actions
            ],
            "combat": {
                "name": self.combat.name,
                "attack_skill": self.combat.attack_skill,
                "dodge_skill": self.combat.dodge_skill,
                "damage_formula": self.combat.damage_formula,
                "critical_multiplier": self.combat.critical_multiplier,
                "impale_threshold": self.combat.impale_threshold,
                "max_combatants": self.combat.max_combatants,
            },
            "sanity": {
                "enabled": self.sanity.enabled,
                "fumble_shock_range": list(self.sanity.fumble_shock_range),
                "fear_shock_threshold": self.sanity.fear_shock_threshold,
                "fear_shock_probability": self.sanity.fear_shock_probability,
                "phobia_chance": self.sanity.phobia_chance,
                "indefinite_insanity_threshold": self.sanity.indefinite_insanity_threshold,
                "permanent_insanity_threshold": self.sanity.permanent_insanity_threshold,
            },
            "improvement": {
                "enabled": self.improvement.enabled,
                "success_improvement_chance": self.improvement.success_improvement_chance,
                "failure_improvement_chance": self.improvement.failure_improvement_chance,
                "improvement_die": self.improvement.improvement_die,
                "max_improvement_per_skill": self.improvement.max_improvement_per_skill,
            },
            "items": [
                {
                    "id": item.id,
                    "name": item.name,
                    "category": item.category,
                    "description": item.description,
                    "skill_bonus": item.skill_bonus,
                    "sanity_cost": item.sanity_cost,
                    "uses": item.uses,
                    "effects": item.effects,
                }
                for item in self.items.values()
            ],
            "tomes": [
                {
                    "id": tome.id,
                    "name": tome.name,
                    "mythos_rating": tome.mythos_rating,
                    "spells": tome.spells,
                    "sanity_cost_first_read": tome.sanity_cost_first_read,
                    "sanity_cost_study": tome.sanity_cost_study,
                    "cthulhu_mythos_bonus": tome.cthulhu_mythos_bonus,
                }
                for tome in self.tomes.values()
            ],
            "campaign_arcs": [
                {
                    "id": arc.id,
                    "name": arc.name,
                    "stages": arc.stages,
                    "required_themes": arc.required_themes,
                    "climax_condition": arc.climax_condition,
                }
                for arc in self.campaign_arcs.values()
            ],
            "metadata": dict(self.metadata),
        }


def _is_valid_die_formula(formula: str) -> bool:
    """Return True for formulas like '1d6', '2d10+3', '1d6-1', '1d6+db'."""
    if not isinstance(formula, str):
        return False
    return bool(re.fullmatch(r"\d+d\d+([+-](\d+|db))?(\s*/\s*\d+)?", formula.strip().lower()))
