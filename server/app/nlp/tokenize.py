"""Word & sentence tokenization — the preprocessing foundation every other NLP
module builds on. Backed by NLTK's Punkt (sentences) and Treebank (words)."""

from __future__ import annotations

from typing import TypedDict

from nltk.tokenize import sent_tokenize, word_tokenize


class Tokens(TypedDict):
    sentences: list[str]
    words: list[str]


def tokenize(text: str) -> Tokens:
    """Split text into sentences and word tokens."""
    return {"sentences": sent_tokenize(text), "words": word_tokenize(text)}
