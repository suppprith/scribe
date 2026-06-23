"""Standalone demo: WordNet ambiguity + Lesk disambiguation.

    python scripts/nlp/wordnet_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from app.nlp.wordnet_wsd import disambiguate  # noqa: E402

SAMPLE = "I went to the bank to deposit cash near the river."


def main() -> None:
    result = disambiguate(SAMPLE)
    print("INPUT:")
    print(" ", SAMPLE, "\n")
    for entry in result["ambiguous"]:
        print(f"{entry['word']}  ({entry['num_senses']} senses)")
        for sense in entry["senses"]:
            print(f"    - {sense['name']}: {sense['definition']}")
        chosen = entry["chosen_sense"]
        if chosen:
            print(f"  Lesk picked: {chosen['name']} -> {chosen['definition']}")
        print()


if __name__ == "__main__":
    main()
