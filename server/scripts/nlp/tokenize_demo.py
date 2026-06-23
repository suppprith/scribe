"""Standalone demo: word & sentence tokenization.

    python scripts/nlp/tokenize_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from app.nlp.tokenize import tokenize  # noqa: E402

SAMPLE = (
    "Dr. Smith joined the call at 10 a.m. We reviewed the Q3 roadmap, "
    "then assigned action items. Let's ship by Friday!"
)


def main() -> None:
    result = tokenize(SAMPLE)
    print("INPUT:")
    print(" ", SAMPLE, "\n")
    print(f"SENTENCES ({len(result['sentences'])}):")
    for i, sentence in enumerate(result["sentences"], 1):
        print(f"  {i}. {sentence}")
    print(f"\nWORD TOKENS ({len(result['words'])}):")
    print(" ", result["words"])


if __name__ == "__main__":
    main()
