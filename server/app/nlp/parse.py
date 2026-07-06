"""Parsing: constituency (NLTK noun-phrase chunking) + dependency (spaCy), plus
an action-item heuristic built on top. In-product use: pulling action items /
imperatives out of a transcript."""

from __future__ import annotations

import re
from typing import TypedDict

from nltk import RegexpParser, pos_tag
from nltk.tokenize import word_tokenize

from app.nlp.spacy_model import get_nlp

# Constituency: a small chunk grammar for noun phrases.
_NP_GRAMMAR = r"NP: {<DT>?<JJ.*>*<NN.*>+}"
_chunker = RegexpParser(_NP_GRAMMAR)

# Action-item cues: obligation/intent phrases and to-do markers.
_ACTION_PATTERNS = [
    r"\bwe (?:should|need to|have to|must|will|'ll|are going to|gotta)\b",
    r"\byou (?:should|need to|must|have to)\b",
    r"\bi(?:'ll| will)\b",
    r"\blet'?s\b",
    r"\b(?:action item|to-?do|follow[- ]?up|next step)s?\b",
    r"\bplease\b",
]


class Dependency(TypedDict):
    text: str
    dep: str
    head: str
    pos: str


class ActionItem(TypedDict):
    sentence: str
    trigger: str


class ParseResult(TypedDict):
    noun_phrases: list[str]
    dependencies: list[Dependency]
    action_items: list[ActionItem]


def noun_phrase_chunks(text: str) -> list[str]:
    """Constituency chunking: extract noun phrases via an NLTK RegexpParser."""
    tree = _chunker.parse(pos_tag(word_tokenize(text)))
    phrases: list[str] = []
    for subtree in tree.subtrees(lambda t: t.label() == "NP"):
        phrases.append(" ".join(word for word, _ in subtree.leaves()))
    return phrases


def dependency_relations(text: str) -> list[Dependency]:
    """Dependency parse via spaCy: each token's relation to its head."""
    doc = get_nlp()(text)
    return [
        {"text": tok.text, "dep": tok.dep_, "head": tok.head.text, "pos": tok.pos_}
        for tok in doc
        if not tok.is_space
    ]


def _is_imperative(sent) -> bool:
    """True if the sentence opens with a base-form verb (e.g. 'Ship the build')."""
    for tok in sent:
        if tok.is_punct or tok.is_space:
            continue
        return tok.pos_ == "VERB" and tok.tag_ == "VB"
    return False


def action_items(text: str) -> list[ActionItem]:
    """Flag sentences that look like action items, using the dependency parse for
    sentence segmentation + imperative detection and cue phrases for the rest."""
    items: list[ActionItem] = []
    for sent in get_nlp()(text).sents:
        sentence = sent.text.strip()
        lowered = sentence.lower()
        trigger: str | None = None
        for pattern in _ACTION_PATTERNS:
            match = re.search(pattern, lowered)
            if match:
                trigger = match.group(0)
                break
        if trigger is None and _is_imperative(sent):
            trigger = "imperative"
        if trigger:
            items.append({"sentence": sentence, "trigger": trigger})
    return items


def parse(text: str) -> ParseResult:
    return {
        "noun_phrases": noun_phrase_chunks(text),
        "dependencies": dependency_relations(text),
        "action_items": action_items(text),
    }
