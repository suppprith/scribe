"""NLP capability modules: each is a pure-function module reused by both an HTTP
endpoint (app/api/nlp.py) and a standalone demo script (scripts/nlp/)."""

from app.nlp.keywords import keywords
from app.nlp.normalize import normalize_text
from app.nlp.parse import parse
from app.nlp.tokenize import tokenize

__all__ = ["tokenize", "normalize_text", "keywords", "parse"]
