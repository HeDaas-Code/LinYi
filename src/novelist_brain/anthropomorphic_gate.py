"""Anthropomorphic quality gates for fragments, plans and daily outputs.

This module collects the small, well-defined predicate functions used by the
novelist brain to filter out the most common failure modes reported by the
*FragmentQualityGate* and *PlanDeduplicationStore* sections of
``docs/拟人化日程节律与角色社交补强方案_v2.md``.

The goal is to keep the gates:

* **Pure**: only depend on the inputs they receive (no I/O, no LLM calls).
* **Composable**: every check returns ``(passed: bool, reason: str)`` so
  callers can decide whether to log, block, or partially salvage a piece.
* **Cheap**: at most a few string operations per fragment, so we can run them
  inline on every memory write without a measurable performance hit.

Anything that requires an LLM call (e.g. semantic similarity) lives in a
separate helper to keep this module lightweight.
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Iterable

# ---------------------------------------------------------------------------
# Abstract / concrete lexicon
# ---------------------------------------------------------------------------

# Words that, when over-represented, signal "abstract mood postcard" rather
# than lived experience.  Mirrors the markers in the v2 spec, with a small set
# of additional Chinese high-frequency function words.
_ABSTRACT_MARKERS: tuple[str, ...] = (
    "状态",
    "情绪",
    "心情",
    "感觉",
    "余韵",
    "碎片",
    "生活感",
    "计划",
    "总结",
    "感悟",
    "思考",
    "心情",
    "感受",
    "气氛",
    "氛围",
    "思绪",
    "情怀",
    "心态",
    "惆怅",
    "释然",
    "冥想",
    "回想",
    "回忆",
)

# Words that anchor a fragment in something concrete: a body, an object, a
# place, a time, a sound, etc.  At least one of these is required for the
# fragment to be considered "lived" rather than "label-only".
_CONCRETE_MARKERS: tuple[str, ...] = (
    # Natural elements
    "光", "雨", "风", "水", "雾", "云", "雪", "影", "声", "味",
    "暖", "冷", "湿", "热", "凉", "蓝", "白", "红", "黑", "黄", "灰",
    # Objects / rooms
    "纸", "书", "门", "窗", "杯", "碗", "路", "灯", "床", "被",
    "桌", "椅", "柜", "笔", "包", "车", "伞", "锁", "钱", "票",
    "手机", "屏幕", "键盘", "杯子", "杯子", "行李", "钥匙", "包装",
    "碗", "楼梯", "走廊", "玻璃", "墙",
    # Body
    "手", "脚", "眼", "嘴", "肩", "头", "脸", "背", "腰",
    # Animals / people
    "猫", "狗", "鸟", "人", "她", "他", "我", "你", "孩子",
    # Food / drink
    "茶", "咖啡", "饭", "面", "汤", "酒", "糖", "盐", "水", "菜",
    "茶", "粥", "面", "面包", "牛奶",
    # Time / movement
    "走", "坐", "站", "跑", "停", "开", "关", "放", "拿", "翻",
    "写", "看", "听", "闻", "喝", "等", "靠", "拉", "推", "敲",
    "摇", "擦", "洗", "收",
)

# Phrases that are themselves the entire fragment but say almost nothing.
_EMPTY_PHRASES: set[str] = {
    "无",
    "暂无",
    "没有",
    "不知道",
    "说不清",
    "无明确碎片",
    "暂无内容",
    "（暂无）",
    "(暂无)",
    "平稳",
    "没记住",
    "没有记住梦",
    "暂无天气信息",
}

# Phrases that bet the agent is repeating the same pre-canned observation
# over and over.  We refuse to count them as concrete anchors.
_ABSTRACT_HEDGES: tuple[str, ...] = (
    "一如既往",
    "依然",
    "总是",
    "一切照旧",
    "照旧",
    "平常一样",
    "一如既往的",
    "依旧",
    "仍然",
    "还是",
    "还是老样子",
    "老样子",
    "一如往常",
    "再普通不过",
    "没什么特别",
)


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

_WHITESPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[\s,。.;；:：!！?？\"'`、~～()（）\[\]【】{}\-_—/\\]+")


def normalize_fragment_text(text: str) -> str:
    """Return a canonical form of ``text`` for dedup/similarity checks.

    Steps:
    * Unicode NFKC so that visually identical glyphs compare equal.
    * Strip whitespace and the most common Chinese / ASCII punctuation.
    * Lower-case the ASCII portion.
    """
    if not text:
        return ""
    nfkc = unicodedata.normalize("NFKC", text)
    stripped = _PUNCT_RE.sub("", nfkc).strip()
    return stripped.lower()


def signature_fragment(text: str) -> str:
    """Return a stable, deduplication-friendly signature for a fragment.

    Two fragments with the same signature are considered duplicates by the
    text-based gate, regardless of minor punctuation or casing differences.
    """
    return _WHITESPACE_RE.sub("", normalize_fragment_text(text))


# ---------------------------------------------------------------------------
# Quality gate
# ---------------------------------------------------------------------------


class QualityDecision:
    """Outcome of a quality-gate evaluation.

    Attributes:
        passed: ``True`` if the fragment is acceptable, ``False`` otherwise.
        reason: Short machine-readable code (``"empty"``, ``"abstract"``,
            ``"duplicate_signature"``, ``"too_similar"`` ...).
        detail: Optional human-readable hint (e.g. the conflicting
            signature).  May be empty.
    """

    __slots__ = ("passed", "reason", "detail")

    def __init__(self, passed: bool, reason: str = "", detail: str = "") -> None:
        self.passed = passed
        self.reason = reason
        self.detail = detail

    def __bool__(self) -> bool:  # pragma: no cover - trivial
        return self.passed

    def to_dict(self) -> dict[str, str | bool]:
        return {"passed": self.passed, "reason": self.reason, "detail": self.detail}

    def __repr__(self) -> str:  # pragma: no cover - trivial
        return f"QualityDecision(passed={self.passed!s}, reason={self.reason!r}, detail={self.detail!r})"


class FragmentQualityGate:
    """Pure-function quality gate for incoming fragments.

    The gate applies a sequence of cheap, deterministic checks:

    1. **Empty / placeholder** -- rejects phrases like ``"无"`` or
       ``"没有记住梦"`` that always represent "nothing happened".
    2. **Length** -- enforces a soft min/max character count.
    3. **Abstract / concrete balance** -- at least one concrete anchor
       (object, place, body part, ...) is required.  Fragments that are
       entirely abstract mood-postcards are refused.
    4. **Hedge phrases** -- fragments built around "依旧 / 照旧 / 老样子" are
       de-prioritised because they tend to be a pre-canned reaction rather
       than a lived observation.
    5. **Signature dedup** -- the normalised signature must not appear in
       the recent window of already-accepted fragments.
    6. **Near-duplicate similarity** -- if the closest prior fragment has a
       ``SequenceMatcher`` ratio above ``similarity_threshold`` the new one
       is treated as a near-duplicate and refused.
    """

    MIN_LENGTH = 4
    MAX_LENGTH = 240
    DEFAULT_SIMILARITY_THRESHOLD = 0.55
    DEFAULT_DEDUP_WINDOW = 50

    def __init__(
        self,
        *,
        min_length: int = MIN_LENGTH,
        max_length: int = MAX_LENGTH,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        dedup_window: int = DEFAULT_DEDUP_WINDOW,
    ) -> None:
        self.min_length = int(min_length)
        self.max_length = int(max_length)
        self.similarity_threshold = float(similarity_threshold)
        self.dedup_window = max(1, int(dedup_window))

    # ------------------------------------------------------------------
    # Individual checks
    # ------------------------------------------------------------------

    def check_not_empty(self, text: str) -> QualityDecision:
        if text is None:
            return QualityDecision(False, "empty", "text is None")
        normalised = normalize_fragment_text(text)
        if not normalised:
            return QualityDecision(False, "empty", "text is whitespace")
        if normalised in _EMPTY_PHRASES:
            return QualityDecision(False, "empty", f"placeholder phrase: {normalised!r}")
        return QualityDecision(True)

    def check_length(self, text: str) -> QualityDecision:
        length = len(text or "")
        if length < self.min_length:
            return QualityDecision(False, "too_short", f"length={length}<{self.min_length}")
        if length > self.max_length:
            return QualityDecision(False, "too_long", f"length={length}>{self.max_length}")
        return QualityDecision(True)

    def check_abstractness(self, text: str) -> QualityDecision:
        """Refuse fragments that are entirely abstract mood-postcards."""
        if not text:
            return QualityDecision(False, "abstract", "no text")
        norm = normalize_fragment_text(text)
        abstract_hits = sum(1 for marker in _ABSTRACT_MARKERS if marker in norm)
        concrete_hits = sum(1 for marker in _CONCRETE_MARKERS if marker in norm)
        if abstract_hits == 0:
            return QualityDecision(True)
        if concrete_hits == 0 and abstract_hits >= 2:
            return QualityDecision(
                False,
                "abstract",
                f"{abstract_hits} abstract markers and no concrete anchor",
            )
        # Heavily abstract but with at least one concrete anchor: still let
        # it through but flag it so callers can lower the salience.
        if abstract_hits >= 4 and concrete_hits <= 1:
            return QualityDecision(
                False,
                "abstract_heavy",
                f"abstract={abstract_hits} concrete={concrete_hits}",
            )
        return QualityDecision(True)

    def check_hedges(self, text: str) -> QualityDecision:
        norm = normalize_fragment_text(text)
        for hedge in _ABSTRACT_HEDGES:
            if hedge in norm:
                return QualityDecision(False, "hedge", f"hedge phrase: {hedge!r}")
        return QualityDecision(True)

    # ------------------------------------------------------------------
    # Dedup
    # ------------------------------------------------------------------

    def find_duplicate_signature(
        self,
        text: str,
        recent_signatures: Iterable[str],
    ) -> str | None:
        """Return the conflicting signature if ``text`` matches any of ``recent_signatures``."""
        sig = signature_fragment(text)
        if not sig:
            return None
        for existing in recent_signatures:
            if not existing:
                continue
            if existing == sig:
                return existing
        return None

    def find_near_duplicate(
        self,
        text: str,
        recent_texts: Iterable[str],
    ) -> tuple[str, float] | None:
        """Return ``(match_text, ratio)`` for the closest near-duplicate above the threshold."""
        sig = signature_fragment(text)
        if not sig:
            return None
        best_text = ""
        best_ratio = 0.0
        for candidate in recent_texts:
            cand_sig = signature_fragment(candidate)
            if not cand_sig:
                continue
            if cand_sig == sig:
                return candidate, 1.0
            # SequenceMatcher is O(n*m); only run when signatures share at
            # least one character (otherwise ratio is necessarily tiny).
            if not (set(sig) & set(cand_sig)):
                continue
            ratio = SequenceMatcher(None, sig, cand_sig).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_text = candidate
        if best_ratio >= self.similarity_threshold and best_text:
            return best_text, best_ratio
        return None

    # ------------------------------------------------------------------
    # Composite
    # ------------------------------------------------------------------

    def evaluate(
        self,
        text: str,
        *,
        recent_signatures: Iterable[str] | None = None,
        recent_texts: Iterable[str] | None = None,
    ) -> QualityDecision:
        """Run every check in order, returning the first failure (or success)."""
        for check in (
            self.check_not_empty,
            self.check_length,
            self.check_abstractness,
            self.check_hedges,
        ):
            decision = check(text)
            if not decision.passed:
                return decision
        if recent_signatures is not None:
            dup = self.find_duplicate_signature(text, recent_signatures)
            if dup:
                return QualityDecision(False, "duplicate_signature", dup)
        if recent_texts is not None:
            near = self.find_near_duplicate(text, recent_texts)
            if near is not None:
                match, ratio = near
                return QualityDecision(
                    False,
                    "too_similar",
                    f"ratio={ratio:.2f}; match={match!r}",
                )
        return QualityDecision(True)

    # ------------------------------------------------------------------
    # Window helpers
    # ------------------------------------------------------------------

    def trim_signatures(self, signatures: list[str]) -> list[str]:
        """Keep only the last ``dedup_window`` non-empty signatures."""
        if not signatures:
            return []
        cleaned = [s for s in signatures if s]
        if len(cleaned) <= self.dedup_window:
            return cleaned
        return cleaned[-self.dedup_window :]


__all__ = [
    "FragmentQualityGate",
    "QualityDecision",
    "normalize_fragment_text",
    "signature_fragment",
]
