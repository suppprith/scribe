"""Standalone demo: TF-IDF search + Precision/Recall/F1/MAP on a labeled set.

    python scripts/nlp/ir_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from app.nlp.ir import TfidfIndex, evaluate  # noqa: E402

DOCUMENTS = [
    "We finalized the Q3 budget and approved the marketing spend.",  # 0
    "The release timeline slips to Friday because of the API bug.",  # 1
    "Marketing will launch the campaign after budget approval.",  # 2
    "The API bug blocks the deployment pipeline.",  # 3
    "Let's schedule the next standup for Monday morning.",  # 4
]

# Small labeled query set: which documents are relevant to each query.
QUERIES = [
    {"query": "budget approval marketing", "relevant": [0, 2]},
    {"query": "api bug release", "relevant": [1, 3]},
]


def main() -> None:
    index = TfidfIndex(DOCUMENTS)

    print("SEARCH results:")
    for q in QUERIES:
        print(f"\n  query: {q['query']!r}")
        for hit in index.search(q["query"], top_n=3):
            print(f"    [{hit['score']:.2f}] #{hit['index']} {hit['document']}")

    print("\nEVALUATION (top_n=2):")
    metrics = evaluate(DOCUMENTS, QUERIES, top_n=2)
    for m in metrics["per_query"]:
        print(
            f"  {m['query']!r}: P={m['precision']:.2f} R={m['recall']:.2f} "
            f"F1={m['f1']:.2f} AP={m['average_precision']:.2f}"
        )
    print(
        f"  MEAN: P={metrics['mean_precision']:.2f} R={metrics['mean_recall']:.2f} "
        f"F1={metrics['mean_f1']:.2f} MAP={metrics['mean_average_precision']:.2f}"
    )


if __name__ == "__main__":
    main()
