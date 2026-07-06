"""Token normalization: Porter stemming vs WordNet lemmatization.

In-product use: normalizing transcript tokens for search and keyword matching.
Lemmatization is POS-aware (it consults the token's part of speech) so verbs and
adjectives lemmatize correctly — which is also where it diverges most from the
purely rule-based stemmer.
"""

from __future__ import annotations

from typing import TypedDict

from nltk import pos_tag
from nltk.corpus import wordnet
from nltk.stem import PorterStemmer, WordNetLemmatizer
from nltk.tokenize import word_tokenize

_stemmer = PorterStemmer()
_lemmatizer = WordNetLemmatizer()


class NormalizedToken(TypedDict):
    token: str
    stem: str
    lemma: str


def _wordnet_pos(penn_tag: str) -> str:
    """Map a Penn Treebank POS tag to the WordNet POS the lemmatizer expects."""
    if penn_tag.startswith("J"):
        return wordnet.ADJ
    if penn_tag.startswith("V"):
        return wordnet.VERB
    if penn_tag.startswith("R"):
        return wordnet.ADV
    return wordnet.NOUN


def normalize_text(text: str) -> list[NormalizedToken]:
    """Return the stem and (POS-aware) lemma for each word token in `text`."""
    tagged = pos_tag(word_tokenize(text))
    return [
        {
            "token": token,
            "stem": _stemmer.stem(token),
            "lemma": _lemmatizer.lemmatize(token, _wordnet_pos(tag)),
        }
        for token, tag in tagged
    ]
