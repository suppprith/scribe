"""Machine translation (MarianMT via CTranslate2). In-product use: making
non-English captions/transcripts/summaries readable in English.

The engine runs Helsinki-NLP `opus-mt` models on the **same runtime as
faster-whisper** — CTranslate2, CPU + int8 — so no extra heavyweight framework
(no PyTorch at inference) is pulled in. Each model is ~300MB and is lazy-loaded
on first use and kept warm, exactly like the ASR model registry.

Models are converted to CTranslate2 format once by ``scripts/download_models.py``
into ``<translation_models_dir>/<model-name>``. Runtime deps (``ctranslate2``,
``transformers`` for the Marian tokenizer, ``sentencepiece``) are imported
lazily so the service still boots when translation isn't installed/configured —
callers get a clear error only when they actually request a translation.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import TYPE_CHECKING

from app.config import settings
from app.logging import get_logger

if TYPE_CHECKING:  # import only for type checkers; never at runtime
    import ctranslate2
    from transformers import MarianTokenizer

log = get_logger("scribe.translate")

# Supported (source, target) language pairs → the opus-mt model that handles
# them. Hindi→EN and Thai→EN are the product direction; EN→Hindi rounds out the
# standalone translation demo. Add a pair here + download its model to extend.
MODELS: dict[tuple[str, str], str] = {
    ("hi", "en"): "opus-mt-hi-en",
    ("th", "en"): "opus-mt-th-en",
    ("en", "hi"): "opus-mt-en-hi",
}


class UnsupportedPairError(ValueError):
    """Raised when no model is configured for a requested language pair."""


class ModelUnavailableError(RuntimeError):
    """Raised when a supported pair's model has not been downloaded/converted."""


def supported_pairs() -> list[tuple[str, str]]:
    """The (source, target) pairs the engine can translate."""
    return list(MODELS)


def _normalize(lang: str) -> str:
    """Lower-case ISO 639-1 code; treat blank/`auto`/`und` as unknown ("")."""
    value = (lang or "").strip().lower()
    return "" if value in ("auto", "und", "unknown") else value


# One loaded (translator, tokenizer) per model name, guarded like the ASR
# registry so concurrent requests don't load the same model twice.
_loaded: dict[str, tuple["ctranslate2.Translator", "MarianTokenizer"]] = {}
_lock = threading.Lock()


def _model_dir(model_name: str) -> Path:
    return Path(settings.translation_models_dir) / model_name


def _load(model_name: str) -> tuple["ctranslate2.Translator", "MarianTokenizer"]:
    """Load a converted CTranslate2 model + its Marian tokenizer, cached warm."""
    loaded = _loaded.get(model_name)
    if loaded is not None:
        return loaded

    with _lock:
        loaded = _loaded.get(model_name)
        if loaded is None:
            # Check for the converted model before importing the heavy runtime, so
            # a not-yet-set-up install gets the actionable message either way.
            path = _model_dir(model_name)
            if not path.exists():
                raise ModelUnavailableError(
                    f"translation model '{model_name}' not found at {path}. "
                    f"Run `python scripts/download_models.py` to fetch and convert it."
                )

            import ctranslate2  # lazy: only needed once translation is used
            from transformers import MarianTokenizer

            log.info(
                "loading translation model '%s' (device=%s compute=%s)",
                model_name,
                settings.device,
                settings.compute_type,
            )
            translator = ctranslate2.Translator(
                str(path), device=settings.device, compute_type=settings.compute_type
            )
            tokenizer = MarianTokenizer.from_pretrained(str(path))
            loaded = (translator, tokenizer)
            _loaded[model_name] = loaded
    return loaded


def translate(text: str, src: str, tgt: str = "en") -> str:
    """Translate `text` from `src` to `tgt` (ISO 639-1 codes).

    No-ops (returns the input) for empty text or when source and target match,
    so callers can pass through English/unknown-language turns unconditionally.
    Raises `UnsupportedPairError` for a pair with no model, or
    `ModelUnavailableError` when the model hasn't been downloaded.
    """
    source = _normalize(src)
    target = _normalize(tgt) or "en"

    stripped = text.strip()
    if not stripped or source == target:
        return text
    if not source:
        # Unknown source language: nothing reliable to translate from.
        raise UnsupportedPairError("source language is unknown; cannot translate")

    model_name = MODELS.get((source, target))
    if model_name is None:
        raise UnsupportedPairError(
            f"unsupported translation pair {source}->{target}; "
            f"supported: {', '.join(f'{s}->{t}' for s, t in MODELS)}"
        )

    translator, tokenizer = _load(model_name)

    # CTranslate2's Marian recipe: feed the tokenizer's subword tokens, decode
    # the model's output tokens back to text (dropping special tokens).
    tokens = tokenizer.convert_ids_to_tokens(tokenizer.encode(stripped))
    results = translator.translate_batch([tokens])
    output_tokens = results[0].hypotheses[0]
    output_ids = tokenizer.convert_tokens_to_ids(output_tokens)
    return tokenizer.decode(output_ids, skip_special_tokens=True).strip()
