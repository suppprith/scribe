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
    r"\b(?:he|she|they) (?:will|'ll|should|needs? to|has to|have to|is going to)\b",
    r"\blet'?s\b",
    r"\b(?:action item|to-?do|follow[- ]?up|next step)s?\b",
    r"\bplease\b",
]

# Modals that turn "<name> …" into an assignment ("Rahul will handle the API").
_ASSIGNMENT_MODALS = r"(?:will|'ll|should|needs? to|has to|is going to|is gonna)"

# "Let's start / wrap up" and friends open and close meetings; they match the
# generic "let's" cue but are meeting choreography, not work to be done.
_TRIVIAL_ACTION = re.compile(
    r"^(?:ok(?:ay)?|alright|right|so|well|um|uh|yeah)?[\s,]*"
    r"let'?s\s+(?:start|begin|get started|go|kick off|wrap up|wrap it up|"
    r"move on|jump in|dive in|do this|get going|call it)\b",
    re.IGNORECASE,
)


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


def _assignment_pattern(assignees: list[str]) -> re.Pattern[str] | None:
    """Match "<person> will/should/needs to …" for the given names.

    Third-person assignments are the most common way work is handed out in a
    meeting ("Rahul will handle the migration"), but they carry no first-person
    cue, so they need the participant list to be recognised.
    """
    names = sorted({n.strip() for n in assignees if n and n.strip()}, key=len, reverse=True)
    if not names:
        return None
    alternation = "|".join(re.escape(n.lower()) for n in names)
    return re.compile(rf"\b(?:{alternation})\s+{_ASSIGNMENT_MODALS}\b", re.IGNORECASE)


def action_items(text: str, assignees: list[str] | None = None) -> list[ActionItem]:
    """Flag sentences that look like action items, using the dependency parse for
    sentence segmentation + imperative detection and cue phrases for the rest.

    `assignees` (typically the meeting's participants) additionally catches work
    assigned to someone by name.
    """
    assignment = _assignment_pattern(assignees or [])
    items: list[ActionItem] = []
    for sent in get_nlp()(text).sents:
        sentence = sent.text.strip()
        lowered = sentence.lower()
        if _TRIVIAL_ACTION.match(lowered):
            continue
        trigger: str | None = None
        if assignment:
            match = assignment.search(sentence)
            if match:
                trigger = match.group(0).lower()
        if trigger is None:
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
