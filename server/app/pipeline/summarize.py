"""End-to-end summarization pipeline — the full custom replacement for the old
Gemini call. Chains the NLP modules into one structured summary:

    tokenize (L1) -> keywords/POS (L3) -> action items via parse (L4)
    -> extractive highlights via TF-IDF (L9) -> template NLG (L7)

Deterministic, CPU-only, no external LLM.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Optional, TypedDict

from nltk.tokenize import sent_tokenize

from app.nlp.ir import rank_sentences
from app.nlp.keywords import keywords as extract_keywords
from app.nlp.nlg import generate_summary
from app.nlp.parse import action_items as extract_action_items
from app.nlp.parse import noun_phrase_chunks

_DECISION_CUES = re.compile(
    r"\b(decided|agreed|approved|resolved|concluded|signed off|sign off|"
    r"we(?:'ll| will)|going with|go with|chose to|settled on)\b",
    re.IGNORECASE,
)


class SummaryResult(TypedDict):
    overview: str
    topics: list[str]
    keywords: list[str]
    decisions: list[str]
    action_items: list[str]
    highlights: list[str]
    prose: str


def _decisions(sentences: list[str]) -> list[str]:
    return [s.strip() for s in sentences if _DECISION_CUES.search(s)]


def _topics(text: str, fallback: list[str], limit: int = 5) -> list[str]:
    """Derive descriptive topics from the most common multi-word noun phrases,
    falling back to top keywords when nothing useful is found."""
    counts: Counter[str] = Counter()
    display: dict[str, str] = {}
    for phrase in noun_phrase_chunks(text):
        key = phrase.lower().strip()
        if len(key) < 4 or " " not in key:  # prefer multi-word, non-trivial phrases
            continue
        counts[key] += 1
        display.setdefault(key, phrase)

    topics = [display[key] for key, _ in counts.most_common(limit)]
    return topics or fallback[:limit]


def summarize(
    transcript: str,
    participants: Optional[list[str]] = None,
    duration_seconds: Optional[float] = None,
    *,
    top_keywords: int = 8,
    top_highlights: int = 5,
) -> SummaryResult:
    text = (transcript or "").strip()
    sentences = sent_tokenize(text) if text else []

    keywords = (
        [k["word"] for k in extract_keywords(text, top_n=top_keywords)["top_keywords"]]
        if text
        else []
    )
    decisions = _decisions(sentences)
    action_items = [a["sentence"] for a in (extract_action_items(text) if text else [])]
    ranked = rank_sentences(sentences, top_n=top_highlights) if sentences else []
    # Present highlights in chronological order for readability.
    highlights = [r["sentence"] for r in sorted(ranked, key=lambda r: r["index"])]
    topics = _topics(text, keywords) if text else []

    summary = generate_summary(
        {
            "participants": participants or [],
            "duration_seconds": duration_seconds,
            "keywords": keywords,
            "topics": topics,
            "decisions": decisions,
            "action_items": [{"text": item} for item in action_items],
            "highlights": highlights,
        }
    )

    return {
        "overview": summary["overview"],
        "topics": topics,
        "keywords": keywords,
        "decisions": decisions,
        "action_items": action_items,
        "highlights": highlights,
        "prose": summary["prose"],
    }
