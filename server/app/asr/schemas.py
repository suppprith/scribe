"""Response schemas for the ASR endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class Word(BaseModel):
    word: str
    start: float
    end: float
    probability: float


class Segment(BaseModel):
    id: int
    start: float
    end: float
    text: str
    avg_logprob: float
    no_speech_prob: float
    words: list[Word] = []


class AsrResult(BaseModel):
    text: str
    language: str
    language_probability: float
    duration: float
    # 0..1 overall confidence, derived from segment average log-probabilities.
    confidence: float
    segments: list[Segment] = []
    words: list[Word] = []
