"""Standalone demo: word frequency (stopwords removed) + POS tagging.

    python scripts/nlp/keywords_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from app.nlp.keywords import keywords  # noqa: E402

SAMPLE = (
    "The roadmap meeting covered the roadmap, the budget, and the timeline. "
    "Budget approval is blocked, so the timeline now depends on the budget."
)


def main() -> None:
    result = keywords(SAMPLE, top_n=5)
    print("INPUT:")
    print(" ", SAMPLE, "\n")
    print("TOP KEYWORDS (stopwords removed):")
    for item in result["top_keywords"]:
        print(f"  {item['word']:<12} {item['count']}")
    print("\nPOS TAGS (first 12):")
    for item in result["pos_tags"][:12]:
        print(f"  {item['token']:<12} {item['pos']}")


if __name__ == "__main__":
    main()
