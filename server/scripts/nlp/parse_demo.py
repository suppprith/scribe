"""Standalone demo: constituency chunking + dependency parse + action items.

    python scripts/nlp/parse_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from app.nlp.parse import action_items, dependency_relations, noun_phrase_chunks  # noqa: E402

SAMPLE = (
    "The new release plan looks solid. We should finalize the budget by Friday. "
    "Send the updated roadmap to the team. The timeline depends on approval."
)


def main() -> None:
    print("INPUT:")
    print(" ", SAMPLE, "\n")

    print("CONSTITUENCY - noun-phrase chunks (NLTK RegexpParser):")
    for np in noun_phrase_chunks(SAMPLE):
        print(f"  - {np}")

    print("\nDEPENDENCY - relations (spaCy, first 12 tokens):")
    for dep in dependency_relations(SAMPLE)[:12]:
        print(f"  {dep['text']:<12} {dep['dep']:<10} -> {dep['head']} ({dep['pos']})")

    print("\nACTION ITEMS:")
    for item in action_items(SAMPLE):
        print(f"  [{item['trigger']}] {item['sentence']}")


if __name__ == "__main__":
    main()
