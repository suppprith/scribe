"""Lazy-loaded, warm-kept faster-whisper model registry."""

from __future__ import annotations

import threading

from faster_whisper import WhisperModel

from app.config import settings
from app.logging import get_logger

log = get_logger("scribe.asr")

_models: dict[str, WhisperModel] = {}
_lock = threading.Lock()


def get_model(name: str) -> WhisperModel:
    """Return a cached WhisperModel, loading it on first use and keeping it warm.

    Weights are downloaded by faster-whisper on first load and cached on disk.
    """
    model = _models.get(name)
    if model is not None:
        return model
    with _lock:
        model = _models.get(name)
        if model is None:
            log.info(
                "loading whisper model '%s' (device=%s compute=%s)",
                name,
                settings.device,
                settings.compute_type,
            )
            model = WhisperModel(name, device=settings.device, compute_type=settings.compute_type)
            _models[name] = model
    return model
