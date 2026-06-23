"""Lazy, shared spaCy pipeline (en_core_web_sm), loaded once and kept warm."""

from __future__ import annotations

from functools import lru_cache

import spacy
from spacy.language import Language

_MODEL = "en_core_web_sm"


@lru_cache(maxsize=1)
def get_nlp() -> Language:
    """Return the shared spaCy pipeline, loading it on first use.

    Raises a clear error if the model hasn't been downloaded yet
    (run `python scripts/download_models.py`).
    """
    try:
        return spacy.load(_MODEL)
    except OSError as exc:  # pragma: no cover - depends on environment
        raise RuntimeError(
            f"spaCy model '{_MODEL}' is not installed. "
            "Run `python scripts/download_models.py`."
        ) from exc
