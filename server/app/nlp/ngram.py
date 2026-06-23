"""N-gram language modeling: next-word prediction (trigram→bigram→unigram
backoff) and Laplace-smoothed sentence probability / perplexity. In-product use:
phrase modeling over accumulated transcripts."""

from __future__ import annotations

import math
from collections import Counter
from typing import TypedDict

from nltk.tokenize import sent_tokenize, word_tokenize

_BOS = "<s>"
_EOS = "</s>"


class Candidate(TypedDict):
    word: str
    probability: float


class Prediction(TypedDict):
    candidates: list[Candidate]
    backoff: str  # "trigram" | "bigram" | "unigram" | "none"


class SentenceProbability(TypedDict):
    tokens: list[str]
    log_prob: float
    perplexity: float


def _tokens(sentence: str) -> list[str]:
    return [t.lower() for t in word_tokenize(sentence)]


class NgramModel:
    """Counts uni/bi/trigrams from a training corpus."""

    def __init__(self) -> None:
        self.unigrams: Counter[str] = Counter()
        self.bigrams: Counter[tuple[str, str]] = Counter()
        self.trigrams: Counter[tuple[str, str, str]] = Counter()
        self.total = 0
        self.vocab: set[str] = set()

    def train(self, text: str) -> NgramModel:
        for sentence in sent_tokenize(text):
            toks = [_BOS, _BOS, *_tokens(sentence), _EOS]
            for w in toks:
                self.vocab.add(w)
            # Skip the sentinel BOS tokens in unigram/total counts.
            for w in toks[2:]:
                self.unigrams[w] += 1
                self.total += 1
            for a, b in zip(toks, toks[1:]):
                self.bigrams[(a, b)] += 1
            for a, b, c in zip(toks, toks[1:], toks[2:]):
                self.trigrams[(a, b, c)] += 1
        return self

    def predict_next(self, prefix: str, top_n: int = 5) -> Prediction:
        """Rank likely next words for `prefix`, backing off tri→bi→unigram."""
        ctx = [_BOS, _BOS, *_tokens(prefix)]
        w1, w2 = ctx[-2], ctx[-1]

        # Trigram: P(w | w1, w2)
        tri = {c: n for (a, b, c), n in self.trigrams.items() if a == w1 and b == w2}
        if tri:
            return self._rank(tri, "trigram", top_n)

        # Bigram: P(w | w2)
        bi = {b: n for (a, b), n in self.bigrams.items() if a == w2}
        if bi:
            return self._rank(bi, "bigram", top_n)

        # Unigram fallback.
        uni = {w: n for w, n in self.unigrams.items() if w != _EOS}
        if uni:
            return self._rank(uni, "unigram", top_n)
        return {"candidates": [], "backoff": "none"}

    @staticmethod
    def _rank(counts: dict[str, int], backoff: str, top_n: int) -> Prediction:
        total = sum(counts.values())
        ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top_n]
        return {
            "candidates": [{"word": w, "probability": n / total} for w, n in ranked],
            "backoff": backoff,
        }

    def sentence_probability(self, sentence: str) -> SentenceProbability:
        """Add-1 (Laplace) smoothed bigram log-probability + perplexity."""
        toks = [_BOS, *_tokens(sentence), _EOS]
        vocab_size = max(len(self.vocab), 1)
        log_prob = 0.0
        for a, b in zip(toks, toks[1:]):
            numer = self.bigrams.get((a, b), 0) + 1
            denom = self.unigrams.get(a, 0) + vocab_size
            log_prob += math.log(numer / denom)
        n = max(len(toks) - 1, 1)
        perplexity = math.exp(-log_prob / n)
        return {"tokens": toks, "log_prob": log_prob, "perplexity": perplexity}


def train(text: str) -> NgramModel:
    return NgramModel().train(text)
