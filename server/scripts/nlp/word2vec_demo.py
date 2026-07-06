"""Standalone demo: Word2Vec embeddings + nearest-neighbor semantic similarity.

Trains on a slice of the NLTK Brown corpus (a single meeting is too small for
meaningful vectors). Run:

    python scripts/nlp/word2vec_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from nltk.corpus import brown  # noqa: E402

from app.nlp.embeddings import most_similar, vectors_for  # noqa: E402

# ~10k sentences keeps training to a few seconds while giving sensible vectors.
DOCUMENTS = [" ".join(sentence) for sentence in brown.sents()[:10_000]]

PARAMS = {"vector_size": 100, "sg": 1, "min_count": 5, "epochs": 5}


def main() -> None:
    print(f"Training Word2Vec (skip-gram) on {len(DOCUMENTS)} Brown sentences...\n")

    sample = vectors_for(DOCUMENTS, ["government"], **PARAMS)
    vec = sample.get("government", [])
    print(f"vector('government') dim={len(vec)}, first 8 dims:")
    print("  ", [round(x, 3) for x in vec[:8]], "\n")

    for term in ("government", "money", "school", "water"):
        neighbours = most_similar(DOCUMENTS, term, top_n=6, **PARAMS)
        pretty = ", ".join(f"{n['word']} ({n['score']:.2f})" for n in neighbours)
        print(f"nearest to {term!r}:\n  {pretty}\n")


if __name__ == "__main__":
    main()
