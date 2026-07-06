"""One-command download of the NLP data + models scribe needs.

    python scripts/download_models.py

Idempotent: re-running only fetches what's missing. Whisper ASR weights are
downloaded lazily on first use by faster-whisper, so they are not fetched here.

Translation models (MarianMT) ARE converted here, once, into CTranslate2 format
so inference needs no PyTorch. The one-time conversion loads the source weights
via `transformers`, so it needs a backend installed (`pip install torch` CPU is
enough); inference afterwards is pure ctranslate2.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

# Both the classic and the renamed (NLTK >= 3.8.2) resource names, so this works
# across NLTK versions.
NLTK_PACKAGES = [
    "punkt",
    "punkt_tab",
    "wordnet",
    "omw-1.4",
    "stopwords",
    "averaged_perceptron_tagger",
    "averaged_perceptron_tagger_eng",
    "brown",  # sample training corpus for the Word2Vec demo
]

SPACY_MODEL = "en_core_web_sm"

# MarianMT opus-mt models → local converted-model directory name. Mirrors
# app.nlp.translate.MODELS. Hindi/Thai → English drive the product; EN → Hindi
# rounds out the standalone translation demo.
TRANSLATION_MODELS = {
    "Helsinki-NLP/opus-mt-hi-en": "opus-mt-hi-en",
    "Helsinki-NLP/opus-mt-th-en": "opus-mt-th-en",
    "Helsinki-NLP/opus-mt-en-hi": "opus-mt-en-hi",
}

# Matches app.config.Settings.translation_models_dir (default "./models").
MODELS_DIR = Path(os.environ.get("TRANSLATION_MODELS_DIR", "./models"))


def download_nltk() -> None:
    import nltk

    for package in NLTK_PACKAGES:
        print(f"[scribe] nltk: {package}")
        nltk.download(package, quiet=True)


def download_spacy() -> None:
    import spacy

    try:
        spacy.load(SPACY_MODEL)
        print(f"[scribe] spaCy: {SPACY_MODEL} already present")
        return
    except OSError:
        pass
    print(f"[scribe] spaCy: downloading {SPACY_MODEL}")
    subprocess.run([sys.executable, "-m", "spacy", "download", SPACY_MODEL], check=True)


def _converter() -> str:
    """Path to ct2-transformers-converter in the same environment as this
    Python. Resolved next to sys.executable rather than by bare name, so the
    script works even when the venv isn't activated (on Windows the bare name
    isn't found on PATH in that case)."""
    exe = Path(sys.executable).with_name("ct2-transformers-converter")
    for candidate in (exe, exe.with_suffix(".exe")):
        if candidate.exists():
            return str(candidate)
    return "ct2-transformers-converter"  # fall back to PATH lookup


def download_translation_models() -> None:
    """Convert each opus-mt model to int8 CTranslate2 format and save its
    tokenizer alongside, so MarianTokenizer loads fully offline from the local
    directory afterwards. Skips a model whose output directory already exists,
    so re-running is cheap.

    The tokenizer is saved via transformers rather than the converter's
    --copy_files (the opus-mt repos don't ship every file that option expects,
    e.g. special_tokens_map.json — save_pretrained generates a complete set)."""
    from transformers import AutoTokenizer

    for model_id, out_name in TRANSLATION_MODELS.items():
        out_dir = MODELS_DIR / out_name
        if out_dir.exists():
            print(f"[scribe] translate: {out_name} already converted")
            continue
        print(f"[scribe] translate: converting {model_id} -> {out_dir} (int8)")
        subprocess.run(
            [
                _converter(),
                "--model",
                model_id,
                "--output_dir",
                str(out_dir),
                "--quantization",
                "int8",
            ],
            check=True,
        )
        AutoTokenizer.from_pretrained(model_id).save_pretrained(out_dir)


def main() -> None:
    download_nltk()
    download_spacy()
    download_translation_models()
    print("[scribe] model/data download complete.")


if __name__ == "__main__":
    main()
