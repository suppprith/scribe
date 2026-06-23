"""Keyword & topic extraction: frequency distribution after stopword removal,
plus POS tags. In-product use: the keywords/topics shown on the web and fed to
the summarizer."""

from __future__ import annotations

from collections import Counter
from typing import TypedDict

from nltk import pos_tag
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize

_STOPWORDS = set(stopwords.words("english"))


class KeywordCount(TypedDict):
    word: str
    count: int


class PosTag(TypedDict):
    token: str
    pos: str


class Keywords(TypedDict):
    top_keywords: list[KeywordCount]
    pos_tags: list[PosTag]


def keywords(text: str, top_n: int = 10) -> Keywords:
    """Top-N keywords by frequency (alphabetic, lowercased, stopwords removed)
    plus the POS tag of every token."""
    tokens = word_tokenize(text)
    tagged = pos_tag(tokens)

    content = [t.lower() for t in tokens if t.isalpha() and t.lower() not in _STOPWORDS]
    counts = Counter(content)

    return {
        "top_keywords": [{"word": w, "count": c} for w, c in counts.most_common(top_n)],
        "pos_tags": [{"token": tok, "pos": pos} for tok, pos in tagged],
    }
