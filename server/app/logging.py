"""Structured, consistent logging for the NLP service."""

from __future__ import annotations

import logging
import sys

_FORMAT = "%(asctime)s %(levelname)-7s [%(name)s] %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"
_configured = False


def configure_logging(level: int = logging.INFO) -> None:
    """Install a single stdout handler with a consistent format. Idempotent."""
    global _configured
    if _configured:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT, _DATEFMT))
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    # uvicorn's own loggers should flow through the root handler too.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True
    # Quiet chatty third-party training/IO loggers.
    for name in ("gensim", "gensim.models.word2vec", "gensim.utils"):
        logging.getLogger(name).setLevel(logging.WARNING)
    _configured = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
