"""NLP capability modules: each is a pure-function module reused by both an HTTP
endpoint (app/api/nlp.py) and a standalone demo script (scripts/nlp/)."""

from app.nlp.embeddings import most_similar, vectors_for
from app.nlp.ir import TfidfIndex, rank_sentences
from app.nlp.keywords import keywords
from app.nlp.ngram import NgramModel
from app.nlp.nlg import generate_summary
from app.nlp.normalize import normalize_text
from app.nlp.parse import parse
from app.nlp.tokenize import tokenize
from app.nlp.wordnet_wsd import disambiguate

__all__ = [
    "tokenize",
    "normalize_text",
    "keywords",
    "parse",
    "NgramModel",
    "disambiguate",
    "TfidfIndex",
    "rank_sentences",
    "generate_summary",
    "vectors_for",
    "most_similar",
]
