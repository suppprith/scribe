"""One-command download of the NLP data + models scribe needs.

    python scripts/download_models.py

Idempotent: re-running only fetches what's missing. Whisper ASR weights are
downloaded lazily on first use by faster-whisper, so they are not fetched here.
"""

from __future__ import annotations

import subprocess
import sys

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


def main() -> None:
    download_nltk()
    download_spacy()
    print("[scribe] model/data download complete.")


if __name__ == "__main__":
    main()
