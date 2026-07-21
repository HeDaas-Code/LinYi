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
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    # 仅用于类型注解，避免与 coc_mapping_engine 形成运行时循环导入。
    from src.novelist_brain.coc_mapping_engine import COCMappingEngine


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

        # === Task 3.2.1: 动态注入层 ===
        # ``dynamic_skills`` / ``dynamic_actions`` / ``sanity_rules`` 由
        # :class:`COCMappingEngine` 通过 ``inject_*`` 方法注入，``get_*``
        # 查询方法优先返回这些动态规则，缺失时回落到上面的默认字段，
        # 从而保留默认 Rulebook 作为 fallback (SubTask 3.2.2)。
        self.dynamic_skills: dict[str, dict[str, Any]] = dict(
            data.get("dynamic_skills", {})
        )
        self.dynamic_actions: dict[str, dict[str, Any]] = dict(
            data.get("dynamic_actions", {})
        )
        self.sanity_rules: dict[str, Any] = dict(data.get("sanity_rules", {}))

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

    # ------------------------------------------------------------------
    # Task 3.2.1: 动态注入接口（COCMappingEngine → Rulebook）
    # ------------------------------------------------------------------

    def inject_skills(self, skills: dict[str, Any] | list[str]) -> None:
        """注入动态技能规则。

        ``skills`` 可以是 ``dict[str, dict]``（键为技能名，值为规则 dict，
        例如 ``{'克苏鲁神话': {'difficulty': 'hard'}}``）或 ``list[str]``
        （技能名列表，规则为空 dict）。注入后：

        - ``dynamic_skills`` 保留原始 dict 形式，供 :meth:`get_skill` 查询；
        - ``self.skills`` 同步加入对应的 :class:`SkillDef`，使
          :class:`GameMaster` 无需修改即可通过 ``base_value_for_skill``
          等接口使用动态技能。

        重复注入同名技能会覆盖之前的动态规则。
        """
        if isinstance(skills, dict):
            items: list[tuple[str, dict[str, Any]]] = [
                (str(name), dict(rule) if isinstance(rule, dict) else {"value": rule})
                for name, rule in skills.items()
            ]
        else:
            items = [(str(name), {}) for name in skills]
        for name, rule in items:
            self.dynamic_skills[name] = dict(rule)
            # 同步到 self.skills，使 GameMaster 能直接查询到 SkillDef。
            skill_def = SkillDef(
                name=name,
                base_value=float(rule.get("base_value", 0.0)) if rule else 0.0,
                attributes=list(rule.get("attributes", [])) if rule else [],
                description=str(rule.get("description", "")) if rule else "",
                tags=list(rule.get("tags", [])) if rule else [],
            )
            self.skills[name] = skill_def

    def inject_actions(self, actions: dict[str, Any] | list[str]) -> None:
        """注入动态动作规则。

        ``actions`` 可以是 ``dict[str, dict]``（键为动作名，值为规则 dict，
        例如 ``{'阅读禁书': {'sanity_cost': 10}}``）或 ``list[str]``
        （动作名列表）。注入后：

        - ``dynamic_actions`` 保留原始 dict 形式，供 :meth:`get_action` 查询；
        - ``self.actions`` 同步加入对应的 :class:`ActionDef`，使
          :class:`GameMaster.skill_for_action` 能匹配到动态动作。

        重复注入同名动作会覆盖之前的动态规则并追加新的 ActionDef。
        """
        if isinstance(actions, dict):
            items: list[tuple[str, dict[str, Any]]] = [
                (str(name), dict(rule) if isinstance(rule, dict) else {"value": rule})
                for name, rule in actions.items()
            ]
        else:
            items = [(str(name), {}) for name in actions]
        # 移除已存在的同名 ActionDef，避免 skill_for_action 命中陈旧规则。
        existing_names = {name for name, _ in items}
        self.actions = [a for a in self.actions if a.name not in existing_names]
        for name, rule in items:
            self.dynamic_actions[name] = dict(rule)
            action_def = ActionDef(
                name=name,
                skill=str(rule.get("skill", "")) if rule else "",
                keywords=list(rule.get("keywords", [name])) if rule else [name],
                difficulty=float(rule.get("difficulty", 1.0)) if rule else 1.0,
                default_modifier=float(rule.get("default_modifier", 0.0)) if rule else 0.0,
            )
            self.actions.append(action_def)

    def inject_sanity_rules(self, rules: dict[str, Any]) -> None:
        """注入动态 sanity 规则。

        ``rules`` 是 ``dict[str, Any]``，键为规则名（如 ``enabled``、
        ``fumble_shock_range``），值为任意 JSON-safe 内容。注入后：

        - ``sanity_rules`` 保留原始 dict，供 :meth:`get_sanity_rule` 查询；
        - 若规则名匹配 :class:`SanityRule` 字段，则同步更新 ``self.sanity``，
          使 :class:`GameMaster` 直接通过 ``rulebook.sanity`` 读取最新规则。
        """
        for key, value in rules.items():
            self.sanity_rules[key] = value
        # 把匹配 SanityRule 字段的部分同步到 self.sanity。
        sanity_fields = {
            "enabled",
            "fumble_shock_range",
            "fear_shock_threshold",
            "fear_shock_probability",
            "phobia_chance",
            "indefinite_insanity_threshold",
            "permanent_insanity_threshold",
        }
        updates: dict[str, Any] = {}
        for key in sanity_fields:
            if key in rules:
                value = rules[key]
                if key == "fumble_shock_range" and isinstance(value, (list, tuple)):
                    value = tuple(float(v) for v in value)
                elif key == "enabled":
                    value = bool(value)
                else:
                    try:
                        value = float(value)
                    except (TypeError, ValueError):
                        continue
                updates[key] = value
        if updates:
            self.sanity = SanityRule(
                enabled=updates.get("enabled", self.sanity.enabled),
                fumble_shock_range=updates.get(
                    "fumble_shock_range", self.sanity.fumble_shock_range
                ),
                fear_shock_threshold=updates.get(
                    "fear_shock_threshold", self.sanity.fear_shock_threshold
                ),
                fear_shock_probability=updates.get(
                    "fear_shock_probability", self.sanity.fear_shock_probability
                ),
                phobia_chance=updates.get("phobia_chance", self.sanity.phobia_chance),
                indefinite_insanity_threshold=updates.get(
                    "indefinite_insanity_threshold",
                    self.sanity.indefinite_insanity_threshold,
                ),
                permanent_insanity_threshold=updates.get(
                    "permanent_insanity_threshold",
                    self.sanity.permanent_insanity_threshold,
                ),
            )

    def load_from_mapping_engine(
        self,
        mapping_engine: "COCMappingEngine",
        genre: str,
        world_rules: list | None = None,
    ) -> "Rulebook":
        """从 :class:`COCMappingEngine` 构造 Rulebook 并注入到 ``self``。

        调用 ``mapping_engine.build_rulebook(genre, world_rules)`` 得到一个
        完整 Rulebook，再把其中的 skills / actions / sanity / tomes / items /
        combat / metadata 注入到当前 Rulebook 的动态层与默认层。返回
        ``self`` 以便链式调用。原有的默认字段作为 fallback 保留。
        """
        new_rb = mapping_engine.build_rulebook(genre, world_rules or [])

        # 注入 skills (SkillDef → dict[str, dict])。
        skills_dict: dict[str, dict[str, Any]] = {}
        for name, skill in new_rb.skills.items():
            skills_dict[name] = {
                "name": skill.name,
                "base_value": skill.base_value,
                "attributes": list(skill.attributes),
                "description": skill.description,
                "tags": list(skill.tags),
            }
        self.inject_skills(skills_dict)

        # 注入 actions (ActionDef → dict[str, dict])。
        actions_dict: dict[str, dict[str, Any]] = {}
        for act in new_rb.actions:
            actions_dict[act.name] = {
                "name": act.name,
                "skill": act.skill,
                "keywords": list(act.keywords),
                "difficulty": act.difficulty,
                "default_modifier": act.default_modifier,
            }
        self.inject_actions(actions_dict)

        # 注入 sanity 规则 (SanityRule → dict[str, Any])。
        sanity_dict: dict[str, Any] = {
            "enabled": new_rb.sanity.enabled,
            "fumble_shock_range": list(new_rb.sanity.fumble_shock_range),
            "fear_shock_threshold": new_rb.sanity.fear_shock_threshold,
            "fear_shock_probability": new_rb.sanity.fear_shock_probability,
            "phobia_chance": new_rb.sanity.phobia_chance,
            "indefinite_insanity_threshold": new_rb.sanity.indefinite_insanity_threshold,
            "permanent_insanity_threshold": new_rb.sanity.permanent_insanity_threshold,
        }
        self.inject_sanity_rules(sanity_dict)

        # 合并其它字段，使 GameMaster 通过 rulebook.combat / rulebook.tomes
        # 等接口也能享受到 mapping engine 注入的内容。
        self.combat = new_rb.combat
        self.improvement = new_rb.improvement
        self.tomes.update(new_rb.tomes)
        self.items.update(new_rb.items)
        self.campaign_arcs.update(new_rb.campaign_arcs)
        if new_rb.metadata:
            self.metadata.update(new_rb.metadata)
        self.name = new_rb.name
        self.version = new_rb.version
        return self

    # ------------------------------------------------------------------
    # Task 3.2.2: 查询接口（含 fallback）
    # ------------------------------------------------------------------

    def get_skill(self, name: str) -> dict[str, Any] | None:
        """按名称查询技能规则。

        优先返回 :meth:`inject_skills` 注入的 ``dynamic_skills[name]``，
        缺失时回落到默认 ``self.skills`` 中的 :class:`SkillDef`（转为 dict），
        都没有时返回 ``None``。
        """
        if name in self.dynamic_skills:
            return dict(self.dynamic_skills[name])
        skill = self.skills.get(name)
        if skill is None:
            return None
        return {
            "name": skill.name,
            "base_value": skill.base_value,
            "attributes": list(skill.attributes),
            "description": skill.description,
            "tags": list(skill.tags),
        }

    def get_action(self, name: str) -> dict[str, Any] | None:
        """按名称查询动作规则。

        优先返回 :meth:`inject_actions` 注入的 ``dynamic_actions[name]``，
        缺失时回落到默认 ``self.actions`` 中第一个匹配名称的
        :class:`ActionDef`（转为 dict），都没有时返回 ``None``。
        """
        if name in self.dynamic_actions:
            return dict(self.dynamic_actions[name])
        for act in self.actions:
            if act.name == name:
                return {
                    "name": act.name,
                    "skill": act.skill,
                    "keywords": list(act.keywords),
                    "difficulty": act.difficulty,
                    "default_modifier": act.default_modifier,
                }
        return None

    def get_sanity_rule(self, name: str) -> dict[str, Any] | None:
        """按名称查询 sanity 规则。

        优先返回 :meth:`inject_sanity_rules` 注入的
        ``sanity_rules[name]``，缺失时回落到默认 ``self.sanity`` 的对应字段
        （若字段存在），都没有时返回 ``None``。
        """
        if name in self.sanity_rules:
            return self.sanity_rules[name]
        # 回落到 SanityRule 字段。
        if hasattr(self.sanity, name):
            value = getattr(self.sanity, name)
            if isinstance(value, tuple):
                return list(value)
            return value
        return None

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
            # Task 3.2: 动态注入层也参与序列化，使 roundtrip 保留注入的规则。
            "dynamic_skills": {k: dict(v) for k, v in self.dynamic_skills.items()},
            "dynamic_actions": {k: dict(v) for k, v in self.dynamic_actions.items()},
            "sanity_rules": dict(self.sanity_rules),
        }


def _is_valid_die_formula(formula: str) -> bool:
    """Return True for formulas like '1d6', '2d10+3', '1d6-1', '1d6+db'."""
    if not isinstance(formula, str):
        return False
    return bool(re.fullmatch(r"\d+d\d+([+-](\d+|db))?(\s*/\s*\d+)?", formula.strip().lower()))
