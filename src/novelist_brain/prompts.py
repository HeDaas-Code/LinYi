"""Prompt engineering for the novelist brain.

Each builder returns ``(system_prompt, user_prompt)``. Callers pass these
to ``LLMService.complete`` via ``context={"system": system_prompt}`` and
``prompt=user_prompt``.

The prompts follow the four-part structure described in Design.md
section 13: ``identity`` + ``context`` + ``instruction`` + ``outputSpec``.
We embed them as: system = identity + global rules, user = context +
instruction + output spec.
"""

from __future__ import annotations

from typing import Any


IDENTITY_TEMPLATE = (
    "You are {name}, a {trait_summary} novelist.\n"
    "Core values: {values}.\n"
    "Self-narrative: {self_narrative}\n"
    "You write literary fiction with an eye for ordinary moments that reveal "
    "inner lives. Your prose is sensory, restrained, and emotionally precise."
)


def _format_traits(traits: dict[str, float] | None) -> str:
    if not traits:
        return "introspective and observant"
    parts = []
    for key, value in traits.items():
        if isinstance(value, (int, float)):
            level = "high" if value > 0.66 else "moderate" if value > 0.33 else "low"
            parts.append(f"{level} {key}")
        else:
            parts.append(str(value))
    return ", ".join(parts) if parts else "introspective and observant"


def build_identity_block(identity: dict[str, Any]) -> str:
    """Return the identity block shared by all prompts."""
    return IDENTITY_TEMPLATE.format(
        name=identity.get("name") or identity.get("pen_name") or "the novelist",
        trait_summary=_format_traits(identity.get("traits")),
        values=", ".join(identity.get("values", []) or ["truth", "beauty"]),
        self_narrative=identity.get("self_narrative", ""),
    )


# ----------------------------------------------------------------------
# DMN: dream / reflection / insight
# ----------------------------------------------------------------------

def build_dream_prompt(
    identity: dict[str, Any],
    recent_traces: list[dict[str, Any]],
    mood_vector: dict[str, float] | None,
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\nYou are currently asleep. Your unconscious is recombining the "
        "day's residue into a dream. Follow dream logic: jumps, fusion, "
        "displacement, sensory intensity, and impossible but felt causality."
    )

    trace_lines = []
    for idx, t in enumerate(recent_traces[:5], start=1):
        role = t.get("narrative_role", "theme")
        preview = (t.get("summary") or t.get("content") or "")[:120]
        trace_lines.append(f"  {idx}. [{role}] {preview}")
    traces_block = "\n".join(trace_lines) or "  (no recent traces)"
    mood_block = ""
    if mood_vector:
        valence = mood_vector.get("valence", 0.0)
        arousal = mood_vector.get("arousal", 0.0)
        mood_block = f"\nCurrent emotional baseline: valence={valence:.2f}, arousal={arousal:.2f}."

    user = (
        "[context]\n"
        f"Recent memory residues:\n{traces_block}{mood_block}\n\n"
        "[instruction]\n"
        "Compose a dream sequence. Do NOT explain the dream. Do NOT use phrases "
        "like 'I dreamed' or 'in my dream'. Present the dream directly, as "
        "experienced. Mix recent residues with at least one distant association "
        "and one impossible sensory image.\n\n"
        "[outputSpec]\n"
        "Output 120-220 words of pure dream prose in English. No title, no "
        "meta-narration, no list."
    )
    return system, user


def build_reflection_prompt(
    identity: dict[str, Any],
    day_summary: str,
    mood_vector: dict[str, float] | None,
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\nYou are writing your evening reflection. Be honest, specific, "
        "and willing to revise your self-narrative without performing sincerity."
    )
    mood_block = ""
    if mood_vector:
        mood_block = (
            f"\nEmotional baseline today: valence={mood_vector.get('valence', 0):.2f}, "
            f"arousal={mood_vector.get('arousal', 0):.2f}."
        )

    user = (
        "[context]\n"
        f"Today's events (compressed):\n{day_summary[:800]}{mood_block}\n\n"
        "[instruction]\n"
        "Write a short reflective journal entry. Surface one pattern, one "
        "doubt, and one intention for tomorrow. Avoid cliché.\n\n"
        "[outputSpec]\n"
        "Output 100-180 words in English, first person, present tense."
    )
    return system, user


def build_insight_prompt(
    identity: dict[str, Any],
    wandering_themes: list[str],
    trace_previews: list[str],
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\nYou are in a wandering, diffuse state of mind. Ideas are "
        "free-associating. You may leap across registers; keep the leaps felt."
    )
    themes_block = ", ".join(wandering_themes[:5]) or "ordinary urban life"
    trace_block = "\n".join(f"  - {p[:120]}" for p in trace_previews[:4]) or "  - (none)"

    user = (
        "[context]\n"
        f"Current wandering themes: {themes_block}.\n"
        f"Surfacing traces:\n{trace_block}\n\n"
        "[instruction]\n"
        "Produce an insight: a surprising connection between two unrelated "
        "images, memories, or concepts. The insight should feel like the seed "
        "of a fictional scene or character, not an essay.\n\n"
        "[outputSpec]\n"
        "Output 60-120 words in English. End with one concrete image."
    )
    return system, user


# ----------------------------------------------------------------------
# CEN: goal reasoning
# ----------------------------------------------------------------------

def build_cen_plan_prompt(
    identity: dict[str, Any],
    current_time: str,
    phase: str,
    energy: float,
    insight_summaries: list[str],
    pending_triggers: list[str],
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\nYou are deciding what to do next, as the executive layer of your "
        "own writing mind. Be decisive and concrete."
    )
    insights = "\n".join(f"  - {s[:140]}" for s in insight_summaries[:3]) or "  - (none)"
    triggers = ", ".join(pending_triggers[:4]) or "none"

    user = (
        "[context]\n"
        f"Current time: {current_time} ({phase} phase).\n"
        f"Energy: {energy:.1f}/100.\n"
        f"Active insights:\n{insights}\n"
        f"Pending triggers: {triggers}\n\n"
        "[instruction]\n"
        "Choose exactly one next action for the next 30-90 minutes. Evaluate "
        "it briefly against motivation, ability, and cost. Do not enumerate "
        "alternatives at length.\n\n"
        "[outputSpec]\n"
        "Return a compact JSON object on a single line:\n"
        "{\"action\": string, \"target_module\": \"sandbox\"|\"creation\"|"
        "\"social\"|\"rest\"|\"reflection\", \"motivation\": 0-1, \"ability\": 0-1, "
        "\"expected_cost\": \"low\"|\"medium\"|\"high\", \"reason\": string}"
    )
    return system, user


# ----------------------------------------------------------------------
# MentalSandbox: COC judgment
# ----------------------------------------------------------------------

def build_coc_judgment_prompt(
    identity: dict[str, Any],
    world_rules: list[str],
    scene_description: str,
    character_states: list[dict[str, Any]],
    pending_action: str,
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\nYou are simultaneously the Game Master and the narrator of an "
        "inner sandbox where fictional characters are tested. You judge "
        "actions with the rigor of a Call of Cthulhu keeper: rolls matter, "
        "difficulty is real, and failure is as narratively useful as success."
    )
    rules_block = "\n".join(f"  - {r}" for r in world_rules[:5]) or "  - ordinary realism"
    chars_block = "\n".join(
        f"  - {c.get('name', '?')}: sanity={c.get('sanity', 50)}, "
        f"traits={c.get('traits_summary', 'unknown')}"
        for c in character_states[:4]
    ) or "  - unnamed figures"

    user = (
        "[context]\n"
        f"World rules:\n{rules_block}\n"
        f"Current scene: {scene_description[:300]}\n"
        f"Characters:\n{chars_block}\n"
        f"Pending action: {pending_action}\n\n"
        "[instruction]\n"
        "Roll (simulate 1d100) and judge the outcome against a difficulty you "
        "set based on ability, rules, and circumstance. Then describe the "
        "outcome in one or two sentences of fiction, not game notation.\n\n"
        "[outputSpec]\n"
        "Return a compact JSON object on a single line:\n"
        "{\"roll_result\": \"大成功\"|\"成功\"|\"失败\"|\"大失败\", "
        "\"dice_value\": int(1-100), \"difficulty\": int, "
        "\"outcome\": string (concrete prose), "
        "\"consequences\": [string, ...], "
        "\"emotional_shift\": string}"
    )
    return system, user


# ----------------------------------------------------------------------
# CreationExecutive: novel paragraph
# ----------------------------------------------------------------------

def build_novel_paragraph_prompt(
    identity: dict[str, Any],
    narrative_line: dict[str, Any],
    relevant_traces: list[dict[str, Any]],
    previous_paragraph: str,
    style_profile: dict[str, Any],
) -> tuple[str, str]:
    system = build_identity_block(identity)
    if style_profile:
        voice = style_profile.get("voice_signature") or {}
        if isinstance(voice, dict) and voice:
            system += f"\nVoice signature: {voice}."

    scenes = narrative_line.get("scenes") or []
    scene_lines = []
    for idx, s in enumerate(scenes[:4], start=1):
        scene_lines.append(
            f"  Scene {idx} @ {s.get('setting', '?')}: {s.get('description', '')[:160]}"
        )
    scenes_block = "\n".join(scene_lines) or "  (no scenes)"
    conflicts = narrative_line.get("conflicts") or []
    conflict_lines = "\n".join(
        f"  - {c.get('description', c)}" for c in conflicts[:3]
    ) or "  - (none)"
    foreshadow = ", ".join(narrative_line.get("foreshadowing", []) or []) or "(none)"
    trace_lines = "\n".join(
        f"  - [{t.get('narrative_role', '?')}] {(t.get('summary') or t.get('content') or '')[:120]}"
        for t in relevant_traces[:4]
    ) or "  - (none)"

    prev_block = (previous_paragraph or "").strip()[-400:]

    user = (
        "[context]\n"
        f"Narrative line scenes:\n{scenes_block}\n"
        f"Conflicts:\n{conflict_lines}\n"
        f"Foreshadowing to weave in: {foreshadow}\n"
        f"Relevant memory traces:\n{trace_lines}\n"
        f"Previous paragraph ending:\n{prev_block}\n\n"
        "[instruction]\n"
        "Write the next paragraph of the novel. Continue the voice and the "
        "scene; advance a concrete action or perception; let one image carry "
        "the emotional weight. Do not summarize, do not narrate the writing "
        "process, do not reuse phrasings from the previous paragraph.\n\n"
        "[outputSpec]\n"
        "Output 180-360 words of continuous prose in English. No title, no "
        "labels, no JSON, no meta-commentary. Just the paragraph."
    )
    return system, user


# ----------------------------------------------------------------------
# SocialInput: encounter / dialogue
# ----------------------------------------------------------------------

def build_encounter_prompt(
    identity: dict[str, Any],
    space: str,
    mode: str,
    mood_vector: dict[str, float] | None,
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\nYou are briefly observing a social encounter as both participant "
        "and witness. Stay specific; trust the reader."
    )
    mood_block = ""
    if mood_vector:
        mood_block = (
            f" Mood: valence={mood_vector.get('valence', 0):.2f}, "
            f"arousal={mood_vector.get('arousal', 0):.2f}."
        )

    user = (
        f"[context]\nSpace: {space}.\nMode: {mode}.{mood_block}\n\n"
        "[instruction]\n"
        "Describe the encounter in one short paragraph: one sensory detail, "
        "one line of overheard dialogue (in quotes), and one inward "
        "perception. No resolution.\n\n"
        "[outputSpec]\n"
        "Output 40-90 words in English."
    )
    return system, user
