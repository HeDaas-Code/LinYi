"""Prompt engineering for the novelist brain.

每个构造器返回 (system_prompt, user_prompt)。调用方通过
context={"system": system_prompt} 和 prompt=user_prompt 传入 LLMService。

遵循 Design.md 第 13 节的四段式结构：
identity + context + instruction + outputSpec。
所有提示词与模型输出均为纯中文。

阶段二新增（per docs/系统重构方案_v1.md §6.2 / §6.3 / §7 / §9）：
- ``build_chapter_intent_prompt``：Planner 生成 ChapterIntent
- ``build_scene_prose_prompt``：CreationExecutive 将骰子结果转化为文学化段落
- ``build_weave_check_prompt``：四线编织与节拍合规检查
- ``build_de_ai_prompt`` 与 ``DE_AI_RULES``：去 AI 味规则集中定义
"""

from __future__ import annotations

from typing import Any, Literal, TYPE_CHECKING

from src.novelist_brain.persistence import dataclass_to_dict
from src.novelist_brain.trpg_state import SkillCheckOutcome

if TYPE_CHECKING:
    from src.novelist_brain.identity import LinYiProfile
    from src.novelist_brain.models import (
        ChapterIntent,
        Conflict,
        ForeshadowingOp,
        NarrativeLine,
        PlotCompass,
        RhythmProfile,
        Scene,
        StyleFingerprint,
    )


IDENTITY_TEMPLATE = (
    "你是{name_line}，一位{trait_summary}的小说家。\n"
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


def _format_name_line(identity: dict[str, Any] | LinYiProfile) -> str:
    name = identity.get("name") or identity.get("pen_name") or "小说家"
    pen_name = identity.get("pen_name", "")
    if pen_name and pen_name != name:
        return f"{name}（{pen_name}）"
    return name


def build_identity_block(identity: dict[str, Any] | LinYiProfile | LinYiProfile) -> str:
    """返回所有 prompt 共用的身份块。支持 dict 或 LinYiProfile。"""
    if not isinstance(identity, dict):
        identity = dataclass_to_dict(identity) or {}
    return IDENTITY_TEMPLATE.format(
        name_line=_format_name_line(identity),
        trait_summary=_format_traits(identity.get("traits")),
        values="、".join(identity.get("values", []) or ["真实", "美"]),
        self_narrative=identity.get("self_narrative", ""),
    )


# ----------------------------------------------------------------------
# DMN：梦境 / 反思 / 灵感
# ----------------------------------------------------------------------

def build_dream_prompt(
    identity: dict[str, Any] | LinYiProfile,
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
    identity: dict[str, Any] | LinYiProfile,
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
    identity: dict[str, Any] | LinYiProfile,
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
    identity: dict[str, Any] | LinYiProfile,
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
    identity: dict[str, Any] | LinYiProfile,
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
    identity: dict[str, Any] | LinYiProfile,
    narrative_line: dict[str, Any],
    relevant_traces: list[dict[str, Any]],
    previous_paragraph: str,
    style_profile: dict[str, Any],
    attachment_tone: dict[str, Any] | None = None,
) -> tuple[str, str]:
    system = build_identity_block(identity)
    if style_profile:
        voice = style_profile.get("voice_signature") or {}
        if isinstance(voice, dict) and voice:
            system += f"\n声音签名：{voice}。"

    if attachment_tone:
        tone = attachment_tone.get("tone") or {}
        mood = tone.get("mood", "")
        rhythm = tone.get("sentence_rhythm", "")
        themes = tone.get("thematic_bias", [])
        if mood or rhythm or themes:
            system += (
                f"\n当前依恋基调（{attachment_tone.get('style', 'secure')}，"
                f"强度={attachment_tone.get('intensity', 0.0)}）："
            )
            if mood:
                system += f"情绪{mood}；"
            if rhythm:
                system += f"节奏{rhythm}；"
            if themes:
                system += f"主题偏向{ '、'.join(themes)}。"

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
    identity: dict[str, Any] | LinYiProfile,
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


# ----------------------------------------------------------------------
# 阶段二：章节意图 / 场景散文 / 四线编织检查 / 去 AI 味
# （per docs/系统重构方案_v1.md §3.4 Planner、§3.5 CreationExecutive、
#   §6.2 四线编织法、§6.3 节拍曲线、§7 去 AI 味规则）
# ----------------------------------------------------------------------

# 四线编织占比阈值（§6.2 表格）
_FOUR_STRAND_RANGES: dict[str, tuple[float, float]] = {
    "quest": (0.50, 0.70),          # 主线：50-70%
    "fire": (0.10, 0.30),          # 情感线：10-30%
    "constellation": (0.10, 0.30), # 世界观线：10-30%
    "rest": (0.00, 0.20),          # 过渡/节奏：0-20%
}

# 标准六拍曲线（§6.3 flowchart）
_STANDARD_BEATS: list[str] = [
    "章首 Hook（钩子）",
    "主线推进",
    "情感冲突 / 关系变化",
    "世界观揭示 / 禁忌触碰",
    "小爽点 / 微兑现",
    "章末悬念 / 伏笔引入",
]

_SCENE_TYPE_HINTS: dict[str, str] = {
    "dialogue": (
        "对话场景：以两人或多人之间的对白为骨架。对白要长短交错，"
        "潜台词比明言更重要，让读者从沉默和停顿中读出情绪。"
    ),
    "action": (
        "动作场景：以连续动作为主。句子要短，节奏要快，"
        "用动词和具体物件承担冲击力，避免心理独白打断节奏。"
    ),
    "psychological": (
        "心理场景：以人物内心波动为骨架。意识流的跳跃要被感觉到，"
        "但不要变成说明文；用一个具体的意象承载情绪的重量。"
    ),
    "environment": (
        "环境场景：以场景本身为主角。调动至少三类感官，"
        "让空间带有情绪倾向，为后续情节埋下氛围伏笔。"
    ),
    "transition": (
        "过渡场景：用于衔接两个高强度段落。节奏放慢，"
        "用日常细节缓冲疲劳度，但暗中推进 Rest 线的伏笔。"
    ),
}

_SKILL_OUTCOME_CN: dict[SkillCheckOutcome, str] = {
    SkillCheckOutcome.CRITICAL_SUCCESS: "大成功",
    SkillCheckOutcome.HARD_SUCCESS: "困难成功",
    SkillCheckOutcome.SUCCESS: "成功",
    SkillCheckOutcome.FAILURE: "失败",
    SkillCheckOutcome.FUMBLE: "大失败",
}

_SKILL_OUTCOME_PROSE_HINT: dict[SkillCheckOutcome, str] = {
    SkillCheckOutcome.CRITICAL_SUCCESS: (
        "判定为大成功：人物应游刃有余，但写出"
        "那种意外之喜的克制而非喧哗。"
    ),
    SkillCheckOutcome.HARD_SUCCESS: (
        "判定为困难成功：写出在险境中完成的紧绷感，"
        "胜利带着一丝擦伤的余味。"
    ),
    SkillCheckOutcome.SUCCESS: (
        "判定为成功：写出稳扎稳打的完成感，"
        "但留下一处未被解决的小裂缝。"
    ),
    SkillCheckOutcome.FAILURE: (
        "判定为失败：不要写成绝望，而是"
        "写出一种迟疑——计划被推开了一道缝。"
    ),
    SkillCheckOutcome.FUMBLE: (
        "判定为大失败：写出雪崩式的崩坏，"
        "但用具体物件而非情绪形容词承载冲击。"
    ),
}


def _format_narrative_line_summary(line: NarrativeLine) -> str:
    """Render a NarrativeLine as a compact Chinese summary for LLM context."""
    scene_lines = []
    for idx, sc in enumerate(line.scenes[:6], start=1):
        scene_lines.append(
            f"  场景 {idx} @ {sc.setting or '无名之地'}：{sc.description[:140]}"
        )
    scenes_block = "\n".join(scene_lines) or "  （无场景）"

    conflict_lines = []
    for idx, c in enumerate(line.conflicts[:4], start=1):
        stakes = (c.stakes or "未知")[:120]
        state = "已解决" if c.resolved else "未解决"
        conflict_lines.append(
            f"  冲突 {idx}（{state}，张力={c.intensity:.2f}）：{stakes}"
        )
    conflicts_block = "\n".join(conflict_lines) or "  （无显式冲突）"

    foreshadow_block = "、".join(line.foreshadowing[:6]) or "（无）"

    climax_block = "（无）"
    if line.climax is not None:
        cl = line.climax
        climax_block = f"@ {cl.setting or '无名之地'}：{cl.description[:120]}"

    return (
        f"叙事线 ID：{line.id}，状态：{line.status}\n"
        f"场景列表：\n{scenes_block}\n"
        f"冲突：\n{conflicts_block}\n"
        f"伏笔（来自 NarrativeLine）：{foreshadow_block}\n"
        f"高潮场景：{climax_block}"
    )


def _format_plot_compass_summary(compass: PlotCompass) -> str:
    """Render a PlotCompass as a compact Chinese summary."""
    arcs = "、".join(compass.active_long_arcs[:5]) or "（无）"
    return (
        f"终局意图：{compass.ending_intent or '（未指定）'}\n"
        f"尺度：{compass.scale}\n"
        f"活跃长弧：{arcs}\n"
        f"当前弧位置：{compass.current_arc_position or '（未定位）'}"
    )


def _format_rhythm_profile(rhythm: RhythmProfile) -> str:
    """Render a RhythmProfile as a compact Chinese summary."""
    return (
        f"Quest={rhythm.quest_ratio:.2f}, "
        f"Fire={rhythm.fire_ratio:.2f}, "
        f"Constellation={rhythm.constellation_ratio:.2f}, "
        f"Rest={rhythm.rest_ratio:.2f}, "
        f"Hook 强度={rhythm.hook_strength:.2f}, "
        f"爽点密度={rhythm.cool_point_density:.2f}"
    )


def _format_foreshadowing_ops(ops: list[ForeshadowingOp]) -> str:
    """Render a list of ForeshadowingOp as compact lines."""
    if not ops:
        return "  （本次无伏笔操作）"
    lines = []
    op_cn = {
        "introduce": "引入",
        "reinforce": "强化",
        "pay_off": "回收",
        "abandon": "放弃",
    }
    for idx, op in enumerate(ops[:6], start=1):
        action = op_cn.get(op.op_type, op.op_type)
        entry = op.entry_id or "（未编号）"
        note = (op.note or "")[:120]
        lines.append(f"  {idx}. [{action}] {entry}：{note}")
    return "\n".join(lines)


def _format_style_fingerprint(style: StyleFingerprint | None) -> str:
    if style is None:
        return ""
    tone = "、".join(f"{k}={v:.2f}" for k, v in style.tone_markers.items()) or "未指定"
    forbidden = "、".join(style.forbidden_phrases[:6]) or "（无）"
    return (
        f"\n风格指纹：词汇密度={style.vocabulary_density:.2f}，"
        f"句长方差={style.sentence_length_variance:.2f}，"
        f"对白占比={style.dialogue_ratio:.2f}，"
        f"基调标记：{tone}，禁用短语：{forbidden}。"
    )


def _format_world_state_projection(world_state: dict | None) -> str:
    if not world_state:
        return ""
    keys = ("genre", "tone", "geography", "factions", "current_state", "mysteries")
    parts = []
    for k in keys:
        v = world_state.get(k)
        if v is None:
            continue
        if isinstance(v, (dict, list)):
            preview = str(v)[:200]
        else:
            preview = str(v)[:200]
        parts.append(f"  {k}：{preview}")
    if not parts:
        return ""
    return "\n世界状态投影：\n" + "\n".join(parts)


def _format_strand_ranges() -> str:
    parts = []
    strand_cn = {
        "quest": "Quest 主线",
        "fire": "Fire 情感线",
        "constellation": "Constellation 世界观线",
        "rest": "Rest 过渡",
    }
    for strand, (low, high) in _FOUR_STRAND_RANGES.items():
        cn = strand_cn.get(strand, strand)
        parts.append(f"  - {cn}：{low * 100:.0f}%-{high * 100:.0f}%")
    return "\n".join(parts)


def build_chapter_intent_prompt(
    narrative_line: NarrativeLine,
    plot_compass: PlotCompass,
    world_state: dict | None = None,
    style_fingerprint: StyleFingerprint | None = None,
) -> str:
    """构造 Planner 提示词：基于 NarrativeLine + PlotCompass 生成 ChapterIntent。

    返回单条 prompt 字符串（不返回 system/user 元组），由调用方按需
    拼接身份块后送入 LLMService。提示词要求 LLM 输出可被
    ``ChapterIntent.from_dict`` 解析的 JSON。
    """
    line_summary = _format_narrative_line_summary(narrative_line)
    compass_summary = _format_plot_compass_summary(plot_compass)
    strand_block = _format_strand_ranges()
    beats_block = "\n".join(f"  {i}. {b}" for i, b in enumerate(_STANDARD_BEATS, start=1))
    style_block = _format_style_fingerprint(style_fingerprint)
    world_block = _format_world_state_projection(world_state)

    prompt = (
        "[context]\n"
        f"当前叙事线：\n{line_summary}\n\n"
        f"剧情罗盘：\n{compass_summary}\n"
        f"{world_block}{style_block}\n\n"
        "[instruction]\n"
        "你是 Planner，请基于上述叙事线与剧情罗盘，为即将生成的"
        "一章产出 ChapterIntent。严格遵循以下约束：\n"
        "1. 四线编织占比必须落在以下区间内（占比之和为 1.0）：\n"
        f"{strand_block}\n"
        "2. 节拍曲线应覆盖以下六拍，至少命中四拍，并按顺序排列：\n"
        f"{beats_block}\n"
        "3. 若叙事线已携带伏笔，请至少产出一条 ForeshadowingOp "
        "（introduce / reinforce / pay_off / abandon 之一），并在 note 中"
        "说明操作理由；尽量回收一条已 introduced 的伏笔，避免无限堆积。\n"
        "4. emotional_arc 起止情感值应在 [-1, 1] 区间内，"
        "起值反映章首张力，终值反映章末情绪落点。\n"
        "5. scene_type 必须从 dialogue / action / psychological / "
        "environment / transition 中选择一个最契合本章主导节拍的场景类型。\n"
        "6. required_characters 与 required_settings 应来自 NarrativeLine"
        " 中已出现的角色与地点；如本章引入新角色/新地点，需在 note 中标注。\n"
        f"7. 不要复述 narrative_line 的原文，不要写“接下来一章将……”这类"
        "元叙述，直接产出 ChapterIntent 的 JSON。\n\n"
        "[outputSpec]\n"
        "返回单行紧凑 JSON，字段如下（中文值，键名保持英文）：\n"
        '{"chapter_index": 整数, '
        '"scene_type": "dialogue"|"action"|"psychological"|"environment"|"transition", '
        '"narrative_beats": [字符串, ...], '
        '"rhythm": {"quest_ratio": 0-1, "fire_ratio": 0-1, '
        '"constellation_ratio": 0-1, "rest_ratio": 0-1, '
        '"hook_strength": 0-1, "cool_point_density": 0-1}, '
        '"foreshadowing_ops": [{"op_type": "introduce"|"reinforce"|'
        '"pay_off"|"abandon", "entry_id": 字符串, "note": 字符串}, ...], '
        '"required_characters": [字符串, ...], '
        '"required_settings": [字符串, ...], '
        '"emotional_arc": [起值, 终值]}\n'
        "只输出 JSON，无解释、无注释、无 markdown 代码块标记。"
    )
    return prompt


def build_scene_prose_prompt(
    scene_type: Literal[
        "dialogue", "action", "psychological", "environment", "transition"
    ],
    skill_check_outcome: SkillCheckOutcome | None = None,
    chapter_intent: ChapterIntent | None = None,
    current_beat: dict | None = None,
    style_fingerprint: StyleFingerprint | None = None,
    world_state: dict | None = None,
) -> str:
    """构造 CreationExecutive 提示词：将骰子结果转化为文学化段落。

    返回单条 prompt 字符串。要求 LLM 输出 300-500 字的连续中文散文，
    严格遵循场景类型与节拍意图，并符合去 AI 味规则。
    """
    scene_hint = _SCENE_TYPE_HINTS.get(scene_type, f"场景类型：{scene_type}。")

    dice_block = "  （本次场景无骰子判定）"
    if skill_check_outcome is not None:
        outcome_cn = _SKILL_OUTCOME_CN.get(skill_check_outcome, str(skill_check_outcome))
        prose_hint = _SKILL_OUTCOME_PROSE_HINT.get(skill_check_outcome, "")
        dice_block = f"  骰子结果：{outcome_cn}。{prose_hint}"

    intent_block = "  （无章节意图，按场景类型自由发挥）"
    if chapter_intent is not None:
        rhythm_block = _format_rhythm_profile(chapter_intent.rhythm)
        ops_block = _format_foreshadowing_ops(chapter_intent.foreshadowing_ops)
        beats_block = "、".join(chapter_intent.narrative_beats[:6]) or "（无显式节拍）"
        chars = "、".join(chapter_intent.required_characters[:6]) or "（无）"
        settings = "、".join(chapter_intent.required_settings[:6]) or "（无）"
        arc_start, arc_end = chapter_intent.emotional_arc
        intent_block = (
            f"  场景类型：{chapter_intent.scene_type}\n"
            f"  节拍序列：{beats_block}\n"
            f"  四线节奏：{rhythm_block}\n"
            f"  伏笔操作：\n{ops_block}\n"
            f"  必须出场角色：{chars}\n"
            f"  必须出现地点：{settings}\n"
            f"  情感弧线：起 {arc_start:.2f} → 终 {arc_end:.2f}"
        )

    beat_block = "  （无当前节拍）"
    if current_beat:
        beat_name = current_beat.get("name", "")
        beat_intent = current_beat.get("intent", "")
        beat_block = f"  节拍：{beat_name}。意图：{beat_intent}"
        if "target_strand" in current_beat:
            beat_block += f"（目标线：{current_beat['target_strand']}）"

    style_block = _format_style_fingerprint(style_fingerprint)
    world_block = _format_world_state_projection(world_state)

    de_ai_block = "\n".join(f"  - {r}" for r in DE_AI_RULES)

    prompt = (
        "[context]\n"
        f"{scene_hint}\n"
        f"骰子判定：\n{dice_block}\n"
        f"章节意图：\n{intent_block}\n"
        f"当前节拍：\n{beat_block}\n"
        f"{world_block}{style_block}\n\n"
        "[instruction]\n"
        "请将上述骰子判定结果转化为一段文学化小说正文。要求：\n"
        f"1. 把“成功 / 失败 / 大成功 / 大失败”翻译成人物动作、"
        "环境反应、内心波动的具体段落，不要使用游戏术语，"
        f"不要出现“骰子”“判定”“大成功”等词。\n"
        "2. 严格遵守当前场景类型的写法约束（见上）。\n"
        "3. 推进节拍意图：如果当前节拍是 Hook，则用悬念或冲突开场；"
        "如果是爽点，则兑现一处此前埋下的伏笔；"
        "如果是章末悬念，则在不解决主线的前提下留钩。\n"
        "4. 如果章节意图携带了 ForeshadowingOp，"
        f"请在段落中显式完成该伏笔操作（引入 / 强化 / 回收 / 放弃），"
        f"但不要在正文中明说“此处埋下伏笔”。\n"
        "5. 遵循以下去 AI 味规则：\n"
        f"{de_ai_block}\n\n"
        "[outputSpec]\n"
        "输出 300-500 字的连续中文散文。无标题、无标签、无 JSON、"
        "无元注释。只输出段落本身。"
    )
    return prompt


def build_weave_check_prompt(
    chapter_intent: ChapterIntent,
    generated_paragraphs: list[str],
) -> str:
    """构造四线编织合规检查提示词。

    给定 ChapterIntent 与实际生成的段落列表，让 LLM 检查
    段落是否符合四线编织占比与节拍意图，并给出修订建议。
    """
    rhythm_block = _format_rhythm_profile(chapter_intent.rhythm)
    beats_block = (
        "\n".join(f"  {i}. {b}" for i, b in enumerate(chapter_intent.narrative_beats[:6], start=1))
        or "  （无显式节拍）"
    )
    ops_block = _format_foreshadowing_ops(chapter_intent.foreshadowing_ops)
    chars = "、".join(chapter_intent.required_characters[:6]) or "（无）"
    settings = "、".join(chapter_intent.required_settings[:6]) or "（无）"
    arc_start, arc_end = chapter_intent.emotional_arc

    paragraphs_block = "\n\n".join(
        f"【段落 {idx}】\n{(p or '').strip()[:600]}"
        for idx, p in enumerate(generated_paragraphs[:8], start=1)
    ) or "（无段落）"

    prompt = (
        "[context]\n"
        "本章节 ChapterIntent：\n"
        f"  场景类型：{chapter_intent.scene_type}\n"
        f"  节拍序列：\n{beats_block}\n"
        f"  四线节奏：{rhythm_block}\n"
        f"  伏笔操作：\n{ops_block}\n"
        f"  必须出场角色：{chars}\n"
        f"  必须出现地点：{settings}\n"
        f"  情感弧线：起 {arc_start:.2f} → 终 {arc_end:.2f}\n\n"
        "四线编织占比目标区间：\n"
        f"{_format_strand_ranges()}\n\n"
        "实际生成的段落：\n"
        f"{paragraphs_block}\n\n"
        "[instruction]\n"
        "请检查上述段落是否符合 ChapterIntent 与四线编织法：\n"
        "1. 四线占比：估算每段实际归属（Quest / Fire / Constellation / Rest），"
        "汇总占比是否落在目标区间；若超区，指出超在哪条线。\n"
        "2. 节拍覆盖：列出实际命中的节拍，标出缺失节拍；"
        "尤其检查是否缺失章首 Hook 与章末悬念。\n"
        "3. 伏笔操作：逐条核对 ForeshadowingOp 是否在段落中被实际执行；"
        "未执行的标注为 missing，被偷换语义的标注为 drift。\n"
        "4. 角色与设定：required_characters / required_settings 是否齐全；"
        "若有缺失，列出缺失项。\n"
        "5. 情感弧线：起终情感值是否与正文情绪走向一致；"
        "如出现倒挂（终值低于起值却写得昂扬），标注为 inverted。\n"
        "6. 去 AI 味：扫描是否有连接词模板、形容词堆砌、"
        f"段首“他/她”+动词重复等问题，逐条列出违规位置。\n\n"
        "[outputSpec]\n"
        "返回单行紧凑 JSON：\n"
        '{"passes": true|false, "strand_violations": [{"strand": 字符串, '
        '"actual": 0-1, "expected_low": 0-1, "expected_high": 0-1, '
        '"evidence": 字符串}, ...], "missing_beats": [字符串, ...], '
        '"missing_foreshadow_ops": [字符串, ...], '
        '"missing_characters": [字符串, ...], '
        '"missing_settings": [字符串, ...], '
        '"emotional_arc_inverted": true|false, '
        '"de_ai_issues": [{"paragraph_index": 整数, "issue": 字符串, '
        '"snippet": 字符串}, ...], "revision_suggestion": 字符串}\n'
        "只输出 JSON，无解释、无 markdown 标记。"
    )
    return prompt


DE_AI_RULES: list[str] = [
    f"避免使用“然而”“总之”“不仅……而且”“与此同时”“综上所述”“事实上”"
    f"等模板化连接词，改用具体动作或意象承接转折。",
    f"避免空洞形容词堆砌（如“美丽而悲伤”“孤独又坚强”“深沉而复杂”），"
    "改用具体物件与身体感受承载情绪。",
    "多用具体意象（褪色的车票、裂开的水杯、墙角的霉斑）"
    "而非抽象概念（孤独、失落、绝望），让读者自行完成抽象。",
    "对白节奏长短交错：短句制造紧张，长句承担情绪铺陈，"
    "避免连续多句同长度，更避免一段话由等长对白堆成。",
    "每段至少出现三类感官描写（视觉 / 听觉 / 嗅觉 / 触觉 / 味觉），"
    "避免纯视觉叙事，触觉与嗅觉尤其能承载记忆。",
    f"避免段首“他 / 她 / 它 + 动词”的重复结构"
    f"（如“他走过去。她抬起头。他叹了口气。”），"
    "可用动作细节、环境切片或时间副词切入。",
    f"避免“她不禁……”“他暗自想到……”“他突然意识到……”"
    f"“她心中一紧……”等强加心理动词的开场，"
    "改由外部动作或环境反推内心。",
    f"对白应避免说教与解释，不要让角色“借嘴说明设定”；"
    "信息通过冲突、潜台词、答非所问浮现。",
    "保留信息差：单段不要把情绪、动机、结论全部讲透，"
    "相信读者能从细节补完；多用未尽之言与停顿。",
    "节奏由句长与段落密度控制，避免用感叹号、问号、省略号"
    "堆砌强调情绪，每段最多一个标点性符号。",
    f"避免反复使用同一个比喻骨架"
    f"（“像 X 一样 Y”“仿佛被 X”“如同 X 般 Y”），"
    "若必须使用比喻，让喻体取自本章已建立的具体物件。",
    f"避免“这一切”“那种感觉”“某些东西”“一种莫名的”"
    f"等空指代，必须用具体名词替换；空指代只在刻意留白时使用。",
]


def build_de_ai_prompt(
    paragraph: str,
    style_fingerprint: StyleFingerprint | None = None,
) -> str:
    """构造去 AI 味改写提示词。

    给定一段疑似 AI 味浓重的段落，让 LLM 检测违规并产出贴近
    林逸声音签名的改写版本。规则集中定义在 ``DE_AI_RULES``。
    """
    rules_block = "\n".join(f"  {i}. {r}" for i, r in enumerate(DE_AI_RULES, start=1))
    style_block = _format_style_fingerprint(style_fingerprint)
    paragraph_block = (paragraph or "").strip()

    prompt = (
        "[context]\n"
        "待检测段落：\n"
        f"{paragraph_block[:1200]}\n"
        f"{style_block}\n\n"
        "[instruction]\n"
        "请按下列去 AI 味规则逐条扫描该段落，并给出改写版本：\n"
        f"{rules_block}\n\n"
        "扫描要求：\n"
        "1. 逐条规则标出违规位置（引用原文片段，不超过 30 字）。\n"
        "2. 若该段落无某条规则的违规，对应 evidence 留空字符串。\n"
        "3. 改写版本必须保留原段落的核心信息与情绪走向，"
        "只调整句法、意象与连接方式，不得增删情节或人物动作。\n"
        "4. 若提供了风格指纹，改写后应使词汇密度 / 句长方差 / "
        "对白占比向指纹靠拢，并主动回避 forbidden_phrases。\n"
        f"5. 改写版本不得引入新的 AI 味（不得出现新的模板连接词、"
        f"新的空洞形容词、新的“他/她”+动词段首）。\n\n"
        "[outputSpec]\n"
        "返回单行紧凑 JSON：\n"
        '{"violations": [{"rule_index": 整数, "evidence": 字符串, '
        '"fix": 字符串}, ...], "rewritten": 改写后的完整段落字符串, '
        '"change_summary": 字符串}\n'
        "只输出 JSON，无解释、无 markdown 标记。"
    )
    return prompt
