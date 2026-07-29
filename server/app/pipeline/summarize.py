"""End-to-end summarization pipeline — the full custom replacement for the old
Gemini call. Chains the NLP modules into one structured summary:

    tokenize -> keywords/POS -> action items via parsing
    -> extractive highlights via TF-IDF -> template NLG

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

# A transcript line looks like "Speaker: what they said". Anything plausible as a
# display name — used only when the participant list isn't available.
_SPEAKER_PREFIX = re.compile(r"^[\w .'\-]{1,32}$")

_LEADING_ARTICLE = re.compile(r"^(?:the|a|an)\s+", re.IGNORECASE)

# Conversational filler that survives POS tagging as a "noun phrase" ("Okay let")
# but is never a meeting topic.
_FILLER_WORDS = {
    "okay", "ok", "yeah", "yep", "yup", "uh", "um", "hmm", "er", "ah", "oh",
    "let", "lets", "gonna", "wanna", "alright", "hey", "hi", "hello", "bye",
    "thanks", "thank", "guys", "everyone", "sorry", "stuff", "thing", "things",
    "bit", "lot", "kind", "sort", "way", "one", "someone", "something",
}


def _name_tokens(participants: Optional[list[str]]) -> set[str]:
    """Lowercased word tokens of every participant's display name."""
    tokens: set[str] = set()
    for name in participants or []:
        for part in re.split(r"[\s_.\-]+", name.strip().lower()):
            if part:
                tokens.add(part)
    return tokens


def strip_speaker_prefixes(transcript: str, participants: Optional[list[str]] = None) -> str:
    """Drop the "Speaker: " label from each transcript line.

    The bot assembles the transcript as "Speaker: text" lines, so running the NLP
    over it raw counts every participant's name as a content word — the speakers
    end up as the meeting's top keywords, and the leading name breaks both
    sentence segmentation and imperative detection. Known participant names are
    matched exactly; without a participant list, any short name-like prefix is
    used instead. Lines are terminated so two speakers' turns can't merge into
    one sentence.
    """
    names = {n.strip().lower() for n in (participants or []) if n.strip()}
    lines: list[str] = []
    for raw in transcript.splitlines():
        line = raw.strip()
        if not line:
            continue
        head, sep, rest = line.partition(": ")
        if sep and (head.lower() in names if names else bool(_SPEAKER_PREFIX.match(head))):
            line = rest.strip()
        if line and line[-1] not in ".!?":
            line += "."
        if line:
            lines.append(line)
    return "\n".join(lines)


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


def _topics(
    text: str, fallback: list[str], limit: int = 5, exclude: Optional[set[str]] = None
) -> list[str]:
    """Derive descriptive topics from the most common multi-word noun phrases,
    falling back to top keywords when nothing useful is found. Filler phrases and
    participant names are skipped — neither describes what a meeting was about."""
    blocked = _FILLER_WORDS | (exclude or set())
    counts: Counter[str] = Counter()
    display: dict[str, str] = {}
    for phrase in noun_phrase_chunks(text):
        cleaned = _LEADING_ARTICLE.sub("", phrase.strip())
        key = cleaned.lower()
        if len(key) < 4 or " " not in key:  # prefer multi-word, non-trivial phrases
            continue
        if any(word in blocked for word in key.split()):
            continue
        counts[key] += 1
        display.setdefault(key, cleaned)

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
    # Analyse what was said, not who said it — see strip_speaker_prefixes.
    text = strip_speaker_prefixes((transcript or "").strip(), participants)
    sentences = sent_tokenize(text) if text else []
    names = _name_tokens(participants)

    # Names still occur inside sentences ("Rahul will handle the migration");
    # over-fetch so dropping them still leaves a full set of keywords.
    keywords = (
        [
            k["word"]
            for k in extract_keywords(text, top_n=top_keywords * 3)["top_keywords"]
            if k["word"] not in names
        ][:top_keywords]
        if text
        else []
    )
    decisions = _decisions(sentences)
    action_items = [
        a["sentence"]
        for a in (extract_action_items(text, assignees=participants or []) if text else [])
    ]
    ranked = rank_sentences(sentences, top_n=top_highlights) if sentences else []
    # Present highlights in chronological order for readability.
    highlights = [r["sentence"] for r in sorted(ranked, key=lambda r: r["index"])]
    topics = _topics(text, keywords, exclude=names) if text else []

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
