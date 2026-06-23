"""NLP capability modules: each is a pure-function module reused by both an HTTP
endpoint (app/api/nlp.py) and a standalone demo script (scripts/nlp/)."""

from app.nlp.tokenize import tokenize

__all__ = ["tokenize"]
