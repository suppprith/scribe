"""Word2Vec embeddings & semantic similarity (gensim). In-product use: semantic
("meaning-based") search and topic clustering over transcripts.

The model is trained on whatever corpus is provided — the product trains on
accumulated transcripts; a single short transcript is too sparse for good
vectors, so the demo trains on a larger reference corpus instead.
"""

from __future__ import annotations

from typing import Optional, TypedDict

from gensim.models import Word2Vec
from nltk.tokenize import word_tokenize


class SimilarWord(TypedDict):
    word: str
    score: float


def _tokenize(documents: list[str]) -> list[list[str]]:
    return [[t.lower() for t in word_tokenize(doc) if t.isalpha()] for doc in documents]


def train_model(
    documents: list[str],
    *,
    vector_size: int = 100,
    window: int = 5,
    min_count: int = 1,
    sg: int = 0,  # 0 = CBOW, 1 = skip-gram
    epochs: int = 10,
) -> Word2Vec:
    """Train a Word2Vec model on a corpus of documents. Deterministic
    (single worker + fixed seed)."""
    return Word2Vec(
        sentences=_tokenize(documents),
        vector_size=vector_size,
        window=window,
        min_count=min_count,
        sg=sg,
        epochs=epochs,
        workers=1,
        seed=42,
    )


def vectors_for(
    documents: list[str],
    words: Optional[list[str]] = None,
    *,
    max_words: int = 20,
    **params: int,
) -> dict[str, list[float]]:
    """Train, then return the embedding vector for each requested word (or the
    most frequent `max_words` in the vocabulary when none are given)."""
    model = train_model(documents, **params)
    keys = [w.lower() for w in words] if words else list(model.wv.index_to_key)[:max_words]
    return {k: [float(x) for x in model.wv[k]] for k in keys if k in model.wv}


def most_similar(
    documents: list[str],
    word: str,
    top_n: int = 10,
    **params: int,
) -> list[SimilarWord]:
    """Train, then return the nearest words to `word` by cosine similarity."""
    model = train_model(documents, **params)
    key = word.lower()
    if key not in model.wv:
        return []
    return [{"word": w, "score": float(s)} for w, s in model.wv.most_similar(key, topn=top_n)]
