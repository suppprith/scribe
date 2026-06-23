"""WordNet word-sense disambiguation: find words with multiple senses and use
the Lesk algorithm to pick the most likely sense in context. In-product use: an
in-meeting glossary / definitions for ambiguous or jargon terms."""

from __future__ import annotations

from typing import Optional, TypedDict

from nltk.corpus import stopwords, wordnet
from nltk.tokenize import word_tokenize
from nltk.wsd import lesk

_STOPWORDS = set(stopwords.words("english"))
_MAX_SENSES = 5


class Sense(TypedDict):
    name: str
    definition: str


class AmbiguousWord(TypedDict):
    word: str
    num_senses: int
    senses: list[Sense]
    chosen_sense: Optional[Sense]


class Disambiguation(TypedDict):
    ambiguous: list[AmbiguousWord]


def _sense(synset) -> Sense:
    return {"name": synset.name(), "definition": synset.definition()}


def disambiguate(text: str) -> Disambiguation:
    """For each content word with more than one WordNet sense, list its candidate
    senses and the sense Lesk selects given the surrounding sentence."""
    tokens = word_tokenize(text)
    seen: set[str] = set()
    results: list[AmbiguousWord] = []

    for token in tokens:
        lower = token.lower()
        if not token.isalpha() or lower in _STOPWORDS or lower in seen:
            continue
        synsets = wordnet.synsets(lower)
        if len(synsets) < 2:  # ambiguous = more than one sense
            continue
        seen.add(lower)
        chosen = lesk(tokens, lower)
        results.append(
            {
                "word": token,
                "num_senses": len(synsets),
                "senses": [_sense(s) for s in synsets[:_MAX_SENSES]],
                "chosen_sense": _sense(chosen) if chosen else None,
            }
        )

    return {"ambiguous": results}
