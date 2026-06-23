"""Information retrieval over transcript sentences: a TF-IDF vector-space model
for ranked search, Precision/Recall/F-measure/MAP evaluation, and a centrality
ranking the extractive summarizer reuses."""

from __future__ import annotations

from typing import Optional, TypedDict

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class SearchHit(TypedDict):
    index: int
    document: str
    score: float


class RankedSentence(TypedDict):
    index: int
    sentence: str
    score: float


class QueryMetrics(TypedDict):
    query: str
    precision: float
    recall: float
    f1: float
    average_precision: float


class IrMetrics(TypedDict):
    per_query: list[QueryMetrics]
    mean_precision: float
    mean_recall: float
    mean_f1: float
    mean_average_precision: float


class TfidfIndex:
    """A TF-IDF vector-space index over a document set (e.g. transcript sentences)."""

    def __init__(self, documents: list[str]) -> None:
        self.documents = documents
        self.vectorizer = TfidfVectorizer(stop_words="english", lowercase=True)
        try:
            self.matrix = self.vectorizer.fit_transform(documents) if documents else None
        except ValueError:  # empty vocabulary (e.g. all stopwords)
            self.matrix = None

    def search(self, query: str, top_n: int = 5) -> list[SearchHit]:
        """Rank documents by cosine similarity to the query; drop zero scores."""
        if self.matrix is None:
            return []
        query_vec = self.vectorizer.transform([query])
        sims = cosine_similarity(query_vec, self.matrix)[0]
        order = sims.argsort()[::-1]
        hits: list[SearchHit] = []
        for i in order[:top_n]:
            score = float(sims[i])
            if score <= 0.0:
                break
            hits.append({"index": int(i), "document": self.documents[i], "score": score})
        return hits

    def ranked_indices(self, query: str) -> list[int]:
        """Full ranking of document indices for a query (used for MAP)."""
        if self.matrix is None:
            return []
        sims = cosine_similarity(self.vectorizer.transform([query]), self.matrix)[0]
        return [int(i) for i in sims.argsort()[::-1] if sims[i] > 0.0]


def precision_recall_f1(retrieved: list[int], relevant: set[int]) -> tuple[float, float, float]:
    retrieved_set = set(retrieved)
    true_positives = len(retrieved_set & relevant)
    precision = true_positives / len(retrieved_set) if retrieved_set else 0.0
    recall = true_positives / len(relevant) if relevant else 0.0
    denom = precision + recall
    f1 = (2 * precision * recall / denom) if denom else 0.0
    return precision, recall, f1


def average_precision(ranked: list[int], relevant: set[int]) -> float:
    if not relevant:
        return 0.0
    hits = 0
    total = 0.0
    for rank, doc in enumerate(ranked, start=1):
        if doc in relevant:
            hits += 1
            total += hits / rank
    return total / len(relevant)


class LabeledQuery(TypedDict):
    query: str
    relevant: list[int]


def evaluate(documents: list[str], queries: list[LabeledQuery], top_n: int = 5) -> IrMetrics:
    """Run each labeled query and report P/R/F1 (at top_n) plus MAP."""
    index = TfidfIndex(documents)
    per_query: list[QueryMetrics] = []
    for q in queries:
        relevant = set(q["relevant"])
        ranking = index.ranked_indices(q["query"])
        precision, recall, f1 = precision_recall_f1(ranking[:top_n], relevant)
        per_query.append(
            {
                "query": q["query"],
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "average_precision": average_precision(ranking, relevant),
            }
        )

    n = max(len(per_query), 1)
    return {
        "per_query": per_query,
        "mean_precision": sum(m["precision"] for m in per_query) / n,
        "mean_recall": sum(m["recall"] for m in per_query) / n,
        "mean_f1": sum(m["f1"] for m in per_query) / n,
        "mean_average_precision": sum(m["average_precision"] for m in per_query) / n,
    }


def rank_sentences(sentences: list[str], top_n: Optional[int] = None) -> list[RankedSentence]:
    """Rank sentences by TF-IDF centrality (mean cosine similarity to the rest) —
    the extractive signal the summarizer uses to pick the most representative
    sentences. Ties broken by original order."""
    if not sentences:
        return []
    vectorizer = TfidfVectorizer(stop_words="english", lowercase=True)
    try:
        matrix = vectorizer.fit_transform(sentences)
    except ValueError:
        scores = [0.0] * len(sentences)
    else:
        sims = cosine_similarity(matrix)
        count = len(sentences)
        # Mean similarity to the other sentences (exclude self-similarity of 1.0).
        scores = [float((sims[i].sum() - 1.0) / max(count - 1, 1)) for i in range(count)]

    order = sorted(range(len(sentences)), key=lambda i: (-scores[i], i))
    if top_n is not None:
        order = order[:top_n]
    return [{"index": i, "sentence": sentences[i], "score": scores[i]} for i in order]
