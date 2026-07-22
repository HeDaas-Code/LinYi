"""Heuristic importance scoring for fragments and traces.

The novelist brain prototype uses a single float (``Fragment.salience`` in
``[0, 1]``) to model how memorable a piece of experience is.  Until an LLM
judge is wired in we rely on cheap, deterministic heuristics derived from
the v2 spec:

* **Modality** -- a *scene* or *event* is usually more "load-bearing" than
  a fleeting *emotion* or *concept*.
* **Source** -- inputs that arrive from the user (``personal`` /
  ``social``) or from the novel output pipeline (``novel``) are weighted
  more heavily than background *dream* material.
* **Valence / arousal** -- fragments that combine strong feeling with
  activation tend to be more memorable (the "peak-end rule").
* **Tag specificity** -- many unique tags signal a specific situation
  rather than a generic state.

The scorer is intentionally conservative: it returns values inside the
0.0-1.0 range and never invents information that is not present in the
fragment.  It is meant to be the **default** scorer; an LLM judge can
override the score downstream.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .anthropomorphic_gate import normalize_fragment_text

# ---------------------------------------------------------------------------
# Source / modality weights
# ---------------------------------------------------------------------------

#: Default weights for each ``Fragment.source``.  Higher = more likely to be
#: remembered.  Tuned to match the v2 spec ("user/agent vs internal noise").
SOURCE_WEIGHTS: dict[str, float] = {
    "novel": 0.80,
    "social": 0.75,
    "personal": 0.70,
    "cen": 0.65,
    "dmn": 0.60,
    "sandbox": 0.55,
    "multimodal": 0.55,
    "memory": 0.50,
    "dream": 0.35,
}

#: Default weights for each ``Fragment.modality``.
MODALITY_WEIGHTS: dict[str, float] = {
    "scene": 0.85,
    "event": 0.80,
    "dialogue": 0.75,
    "image": 0.65,
    "emotion": 0.50,
    "concept": 0.40,
}

#: Words that indicate the fragment is anchored in a concrete, memorable
#: event (e.g. a *first* time, a *turning* point, a *surprise*).  When at
#: least one is present we boost the score.
_MEMORABILITY_HINTS: tuple[str, ...] = (
    "第一次",
    "首次",
    "转折",
    "意外",
    "惊讶",
    "失手",
    "惊到",
    "突然",
    "终于",
    "发现",
    "意识到",
    "领悟",
    "想起",
    "错过",
    "遇见",
    "碰见",
    "重逢",
    "那一刻",
)

#: Words that signal routine / low-memorability fragments.
_ROUTINE_HINTS: tuple[str, ...] = (
    "照旧",
    "一如既往",
    "还是",
    "依旧",
    "仍然",
    "照常",
    "平常",
    "老样子",
    "普通",
    "日常",
    "没什么",
    "如常",
)


@dataclass
class ImportanceBreakdown:
    """Detailed view of the factors that fed into the final score.

    The fields are normalised to the ``[0, 1]`` range so they can be
    inspected individually by tests or surfaced on the dashboard.
    """

    source_score: float
    modality_score: float
    valence_score: float
    arousal_score: float
    tag_score: float
    content_score: float
    final: float

    def to_dict(self) -> dict[str, float]:
        return {
            "source": self.source_score,
            "modality": self.modality_score,
            "valence": self.valence_score,
            "arousal": self.arousal_score,
            "tags": self.tag_score,
            "content": self.content_score,
            "final": self.final,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clamp01(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return float(value)


def _safe_lookup(mapping: Mapping[str, float], key: str, default: float) -> float:
    value = mapping.get(key)
    if value is None:
        return default
    try:
        return _clamp01(float(value))
    except (TypeError, ValueError):
        return default


def _valence_to_score(valence: float) -> float:
    """Map a ``[-1, 1]`` valence into a ``[0, 1]`` memorability score.

    Strong positive *or* strong negative experiences are both memorable;
    a neutral experience is unmemorable.
    """
    try:
        v = float(valence)
    except (TypeError, ValueError):
        return 0.5
    return _clamp01(abs(v))


def _arousal_to_score(arousal: float) -> float:
    try:
        a = float(arousal)
    except (TypeError, ValueError):
        return 0.3
    return _clamp01(a)


def _content_to_score(content: str) -> float:
    """Heuristic content-based boost.

    * 0-1 memorability hints: 0 boost
    * 1+ memorability hints, 0 routine hints: +0.15
    * Routine hints, 0 memorability hints: -0.10
    * Both cancel out: 0
    """
    if not content:
        return 0.0
    norm = normalize_fragment_text(content)
    if not norm:
        return 0.0
    mem_hits = sum(1 for hint in _MEMORABILITY_HINTS if hint in norm)
    routine_hits = sum(1 for hint in _ROUTINE_HINTS if hint in norm)
    if mem_hits == 0 and routine_hits == 0:
        return 0.0
    if mem_hits > 0 and routine_hits == 0:
        return min(0.20, 0.10 + 0.05 * mem_hits)
    if mem_hits == 0 and routine_hits > 0:
        return -min(0.15, 0.05 + 0.03 * routine_hits)
    # Both present: average them, lean negative (routine usually wins).
    return 0.0


def _tag_to_score(tags: Any) -> float:
    if not tags or not isinstance(tags, (list, tuple, set)):
        return 0.4
    cleaned = [t for t in tags if isinstance(t, str) and t.strip()]
    if not cleaned:
        return 0.4
    # 1 tag = generic, 2-3 = good, 4+ = overly generic (template feel)
    n = len(cleaned)
    if n == 1:
        return 0.5
    if n == 2:
        return 0.65
    if n == 3:
        return 0.75
    if n == 4:
        return 0.70
    if n >= 5:
        return 0.60


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class ImportanceScorer:
    """Compute a ``[0, 1]`` importance score for a fragment-like object.

    The scorer is fully heuristic and deterministic.  Callers can override
    any of the per-dimension weights to match their own narrative style.
    """

    DEFAULT_WEIGHTS: dict[str, float] = {
        "source": 0.20,
        "modality": 0.20,
        "valence": 0.15,
        "arousal": 0.15,
        "tags": 0.15,
        "content": 0.15,
    }

    def __init__(
        self,
        *,
        weights: Mapping[str, float] | None = None,
        source_weights: Mapping[str, float] | None = None,
        modality_weights: Mapping[str, float] | None = None,
    ) -> None:
        weights = weights or self.DEFAULT_WEIGHTS
        total = sum(max(0.0, float(v)) for v in weights.values())
        if total <= 0:
            raise ValueError("ImportanceScorer weights must be positive")
        self.weights = {k: max(0.0, float(v)) / total for k, v in weights.items()}
        self.source_weights = (
            dict(source_weights) if source_weights is not None else dict(SOURCE_WEIGHTS)
        )
        self.modality_weights = (
            dict(modality_weights) if modality_weights is not None else dict(MODALITY_WEIGHTS)
        )

    def score(self, fragment: Any) -> float:
        """Return a single ``[0, 1]`` score for ``fragment``."""
        return self.score_with_breakdown(fragment).final

    def score_with_breakdown(self, fragment: Any) -> ImportanceBreakdown:
        """Return a detailed :class:`ImportanceBreakdown` for ``fragment``."""
        if fragment is None:
            return ImportanceBreakdown(0.4, 0.4, 0.5, 0.3, 0.4, 0.0, 0.4)

        source = getattr(fragment, "source", "personal") or "personal"
        modality = getattr(fragment, "modality", "event") or "event"
        valence = getattr(fragment, "valence", 0.0) or 0.0
        arousal = getattr(fragment, "arousal", 0.0) or 0.0
        tags = getattr(fragment, "tags", None)
        content = getattr(fragment, "content", "") or ""

        source_score = _safe_lookup(self.source_weights, str(source), 0.5)
        modality_score = _safe_lookup(self.modality_weights, str(modality), 0.5)
        valence_score = _valence_to_score(valence)
        arousal_score = _arousal_to_score(arousal)
        tag_score = _tag_to_score(tags)
        content_score = _clamp01(0.5 + _content_to_score(content))

        w = self.weights
        final = (
            w.get("source", 0.0) * source_score
            + w.get("modality", 0.0) * modality_score
            + w.get("valence", 0.0) * valence_score
            + w.get("arousal", 0.0) * arousal_score
            + w.get("tags", 0.0) * tag_score
            + w.get("content", 0.0) * content_score
        )
        return ImportanceBreakdown(
            source_score=_clamp01(source_score),
            modality_score=_clamp01(modality_score),
            valence_score=_clamp01(valence_score),
            arousal_score=_clamp01(arousal_score),
            tag_score=_clamp01(tag_score),
            content_score=_clamp01(content_score),
            final=_clamp01(final),
        )


def suggest_salience(
    fragment: Any,
    *,
    scorer: ImportanceScorer | None = None,
) -> float:
    """Convenience wrapper that returns the suggested ``fragment.salience``.

    If the fragment already carries a non-zero salience the suggestion is
    the *max* of the existing value and the heuristic, so we never lower
    a value that was set explicitly by a caller.
    """
    current = getattr(fragment, "salience", 0.0) if fragment is not None else 0.0
    try:
        current = float(current or 0.0)
    except (TypeError, ValueError):
        current = 0.0
    scorer = scorer or ImportanceScorer()
    candidate = scorer.score(fragment)
    if candidate > current:
        return candidate
    return current


__all__ = [
    "ImportanceScorer",
    "ImportanceBreakdown",
    "SOURCE_WEIGHTS",
    "MODALITY_WEIGHTS",
    "suggest_salience",
]
