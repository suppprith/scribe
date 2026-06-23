"""Standalone demo: n-gram next-word prediction + sentence probability.

    python scripts/nlp/ngram_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from app.nlp.ngram import train  # noqa: E402

CORPUS = (
    "We need to ship the release. We need to review the budget. "
    "We should review the roadmap. The team will ship the roadmap on Friday. "
    "Please review the budget before the meeting."
)


def main() -> None:
    model = train(CORPUS)
    print("CORPUS:\n ", CORPUS, "\n")

    for prefix in ("we need to", "we should", "the team will"):
        pred = model.predict_next(prefix, top_n=3)
        ranked = ", ".join(f"{c['word']} ({c['probability']:.2f})" for c in pred["candidates"])
        print(f"next after '{prefix}'  [{pred['backoff']}]: {ranked}")

    print()
    for sentence in ("We need to review the budget.", "Purple monkeys ship dishwashers."):
        sp = model.sentence_probability(sentence)
        print(f"P('{sentence}')  log_prob={sp['log_prob']:.2f}  perplexity={sp['perplexity']:.1f}")


if __name__ == "__main__":
    main()
