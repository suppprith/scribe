"""Standalone demo: stemming vs lemmatization, side by side.

    python scripts/nlp/normalize_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from app.nlp.normalize import normalize_text  # noqa: E402

# Chosen so stemmer and lemmatizer disagree on several tokens.
SAMPLE = (
    "The studies showed better running times while the geese were flying "
    "and the organizations kept organizing meetings."
)


def main() -> None:
    rows = normalize_text(SAMPLE)
    print(f"{'TOKEN':<16}{'STEM':<16}{'LEMMA':<16}DIVERGES")
    print("-" * 56)
    for row in rows:
        diverges = "<-- " if row["stem"] != row["lemma"] else ""
        print(f"{row['token']:<16}{row['stem']:<16}{row['lemma']:<16}{diverges}")


if __name__ == "__main__":
    main()
