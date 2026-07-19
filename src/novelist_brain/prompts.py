"""Prompt engineering for the novelist brain.

每个构造器返回 (system_prompt, user_prompt)。调用方通过
context={"system": system_prompt} 和 prompt=user_prompt 传入 LLMService。

遵循 Design.md 第 13 节的四段式结构：
identity + context + instruction + outputSpec。
所有提示词与模型输出均为纯中文。
"""

from __future__ import annotations

from typing import Any


IDENTITY_TEMPLATE = (
    "你是{name}，一位{trait_summary}的小说家。\n"
    "核心价值观：{values}。\n"
    "自我叙事：{self_narrative}\n"
    "你书写严肃文学，关注日常瞬间中透出的内在生活。"
    "你的语言感性、克制、精确，善于用感官细节承载情绪。\n"
    "重要：你必须始终用简体中文回答，严禁输出英文散文。"
)


def _format_traits(traits: dict[str, float] | None) -> str:
    if not traits:
        return "内省而敏锐"
    parts = []
    for key, value in traits.items():
        if isinstance(value, (int, float)):
            level = "高" if value > 0.66 else "中等" if value > 0.33 else "低"
            parts.append(f"{level}{key}")
        else:
            parts.append(str(value))
    return "、".join(parts) if parts else "内省而敏锐"


def build_identity_block(identity: dict[str, Any]) -> str:
    """返回所有 prompt 共用的身份块。"""
    return IDENTITY_TEMPLATE.format(
        name=identity.get("name") or identity.get("pen_name") or "小说家",
        trait_summary=_format_traits(identity.get("traits")),
        values="、".join(identity.get("values", []) or ["真实", "美"]),
        self_narrative=identity.get("self_narrative", ""),
    )


# ----------------------------------------------------------------------
# DMN：梦境 / 反思 / 灵感
# ----------------------------------------------------------------------

def build_dream_prompt(
    identity: dict[str, Any],
    recent_traces: list[dict[str, Any]],
    mood_vector: dict[str, float] | None,
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\n你此刻正在沉睡。你的无意识正在将白昼的残余重新组合成梦。"
        "遵循梦的逻辑：跳跃、融合、移置、感官强度、不可能却被切身感知的因果。"
    )

    trace_lines = []
    for idx, t in enumerate(recent_traces[:5], start=1):
        role = t.get("narrative_role", "theme")
        preview = (t.get("summary") or t.get("content") or "")[:120]
        trace_lines.append(f"  {idx}. [{role}] {preview}")
    traces_block = "\n".join(trace_lines) or "  （无近期痕迹）"
    mood_block = ""
    if mood_vector:
        valence = mood_vector.get("valence", 0.0)
        arousal = mood_vector.get("arousal", 0.0)
        mood_block = f"\n当前情绪基线：效价={valence:.2f}，唤醒={arousal:.2f}。"

    user = (
        "[context]\n"
        f"近期记忆残余：\n{traces_block}{mood_block}\n\n"
        "[instruction]\n"
        "创作一段梦境。不要解释这个梦，不要使用“我梦见”或“在梦里”这类话。"
        "直接呈现被体验到的梦境本身。将近期残余与至少一个远距联想、"
        "一个不可能的感官意象混合在一起。\n\n"
        "[outputSpec]\n"
        "输出 120-220 字的纯梦境散文，中文。无标题、无元叙述、无列表。"
    )
    return system, user


def build_reflection_prompt(
    identity: dict[str, Any],
    day_summary: str,
    mood_vector: dict[str, float] | None,
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\n你正在写夜晚的反思札记。诚实、具体，愿意在不表演真诚的前提下"
        "修订自己的自我叙事。"
    )
    mood_block = ""
    if mood_vector:
        mood_block = (
            f"\n今日情绪基线：效价={mood_vector.get('valence', 0):.2f}，"
            f"唤醒={mood_vector.get('arousal', 0):.2f}。"
        )

    user = (
        "[context]\n"
        f"今日事件（压缩）：\n{day_summary[:800]}{mood_block}\n\n"
        "[instruction]\n"
        "写一则简短的反思札记。浮现一个模式、一个疑虑、一个对明天的意图。"
        "避免陈词滥调。\n\n"
        "[outputSpec]\n"
        "输出 100-180 字的中文，第一人称，现在时态。"
    )
    return system, user


def build_insight_prompt(
    identity: dict[str, Any],
    wandering_themes: list[str],
    trace_previews: list[str],
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\n你处于漫游、涣散的状态。观念在自由联想。可以跨越语域跳跃，"
        "但要让跳跃被感觉到。"
    )
    themes_block = "、".join(wandering_themes[:5]) or "寻常的城市生活"
    trace_block = "\n".join(f"  - {p[:120]}" for p in trace_previews[:4]) or "  - （无）"

    user = (
        "[context]\n"
        f"当前漫游主题：{themes_block}。\n"
        f"浮现的痕迹：\n{trace_block}\n\n"
        "[instruction]\n"
        "产出一个灵感：在两个互不相关的意象、记忆或概念之间建立意外的联系。"
        "这个灵感应像一颗虚构场景或人物的种子，而不是论文。\n\n"
        "[outputSpec]\n"
        "输出 60-120 字的中文。结尾给出一个具体的意象。"
    )
    return system, user


# ----------------------------------------------------------------------
# CEN：目标推理
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
        "\n\n你正在决定下一步做什么，作为自己写作之心的执行层。"
        "要果断、具体。"
    )
    insights = "\n".join(f"  - {s[:140]}" for s in insight_summaries[:3]) or "  - （无）"
    triggers = "、".join(pending_triggers[:4]) or "无"

    user = (
        "[context]\n"
        f"当前时间：{current_time}（{phase} 阶段）。\n"
        f"能量：{energy:.1f}/100。\n"
        f"活跃灵感：\n{insights}\n"
        f"待处理触发：{triggers}\n\n"
        "[instruction]\n"
        "为接下来的 30-90 分钟选择恰好一个行动。简要依据动机、能力、成本"
        "进行评估。不要冗长地枚举备选项。\n\n"
        "[outputSpec]\n"
        "返回单行紧凑 JSON：\n"
        "{\"action\": 字符串, \"target_module\": \"sandbox\"|\"creation\"|"
        "\"social\"|\"rest\"|\"reflection\", \"motivation\": 0-1, \"ability\": 0-1, "
        "\"expected_cost\": \"low\"|\"medium\"|\"high\", \"reason\": 字符串}"
    )
    return system, user


# ----------------------------------------------------------------------
# MentalSandbox：COC 判定
# ----------------------------------------------------------------------

def build_coc_judgment_prompt(
    identity: dict[str, Any],
    world_rules: list[str],
    scene_description: str,
    character_states: list[dict[str, Any]],
    pending_action: str,
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\n你同时是一个内在沙盒的守则主持人和叙述者，沙盒中虚构角色正被"
        "测试。你以《克苏鲁的呼唤》守门人的严苛来裁决行动：骰子重要，"
        "难度真实，失败与成功一样具有叙事价值。"
    )
    rules_block = "\n".join(f"  - {r}" for r in world_rules[:5]) or "  - 寻常现实"
    chars_block = "\n".join(
        f"  - {c.get('name', '?')}：sanity={c.get('sanity', 50)}，"
        f"特质={c.get('traits_summary', '未知')}"
        for c in character_states[:4]
    ) or "  - 无名角色"

    user = (
        "[context]\n"
        f"世界规则：\n{rules_block}\n"
        f"当前场景：{scene_description[:300]}\n"
        f"角色：\n{chars_block}\n"
        f"待裁决行动：{pending_action}\n\n"
        "[instruction]\n"
        "投骰（模拟 1d100）并依据你根据能力、规则与情境设定的难度进行判定。"
        "然后用一两句虚构语言描述结果，而不是用游戏术语。\n\n"
        "[outputSpec]\n"
        "返回单行紧凑 JSON：\n"
        "{\"roll_result\": \"大成功\"|\"成功\"|\"失败\"|\"大失败\", "
        "\"dice_value\": 1-100整数, \"difficulty\": 整数, "
        "\"outcome\": 具体散文式描述（中文）, "
        "\"consequences\": [字符串, ...], "
        "\"emotional_shift\": 字符串}"
    )
    return system, user


# ----------------------------------------------------------------------
# CreationExecutive：小说段落
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
            system += f"\n声音签名：{voice}。"

    scenes = narrative_line.get("scenes") or []
    scene_lines = []
    for idx, s in enumerate(scenes[:4], start=1):
        scene_lines.append(
            f"  场景 {idx} @ {s.get('setting', '?')}：{s.get('description', '')[:160]}"
        )
    scenes_block = "\n".join(scene_lines) or "  （无场景）"
    conflicts = narrative_line.get("conflicts") or []
    conflict_lines = "\n".join(
        f"  - {c.get('description', c)}" for c in conflicts[:3]
    ) or "  - （无）"
    foreshadow = "、".join(narrative_line.get("foreshadowing", []) or []) or "（无）"
    trace_lines = "\n".join(
        f"  - [{t.get('narrative_role', '?')}] {(t.get('summary') or t.get('content') or '')[:120]}"
        for t in relevant_traces[:4]
    ) or "  - （无）"

    prev_block = (previous_paragraph or "").strip()[-400:]

    user = (
        "[context]\n"
        f"叙事线场景：\n{scenes_block}\n"
        f"冲突：\n{conflict_lines}\n"
        f"需要织入的伏笔：{foreshadow}\n"
        f"相关记忆痕迹：\n{trace_lines}\n"
        f"上一段结尾：\n{prev_block}\n\n"
        "[instruction]\n"
        "写下小说的下一段。延续声音与场景；推进一个具体的动作或感知；"
        "让一个意象承载情绪的重量。不要概述，不要叙述写作过程，"
        "不要复用上一段的措辞。\n\n"
        "[outputSpec]\n"
        "输出 180-360 字的连续中文散文。无标题、无标签、无 JSON、无元注释。"
        "只输出段落本身。"
    )
    return system, user


# ----------------------------------------------------------------------
# SocialInput：遭遇 / 对话
# ----------------------------------------------------------------------

def build_encounter_prompt(
    identity: dict[str, Any],
    space: str,
    mode: str,
    mood_vector: dict[str, float] | None,
) -> tuple[str, str]:
    system = build_identity_block(identity) + (
        "\n\n你以参与者与旁观者的双重身份短暂观察一次社交遭遇。"
        "保持具体，相信读者。"
    )
    mood_block = ""
    if mood_vector:
        mood_block = (
            f" 情绪：效价={mood_vector.get('valence', 0):.2f}，"
            f"唤醒={mood_vector.get('arousal', 0):.2f}。"
        )

    user = (
        f"[context]\n空间：{space}。\n模式：{mode}。{mood_block}\n\n"
        "[instruction]\n"
        "用一小段描写呈现这次遭遇：一个感官细节，一句被偷听到的对话（用引号），"
        "一次内在感知。不要解决。\n\n"
        "[outputSpec]\n"
        "输出 40-90 字的中文。"
    )
    return system, user
