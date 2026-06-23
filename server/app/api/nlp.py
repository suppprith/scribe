"""HTTP endpoints for the NLP capability modules."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.nlp.keywords import keywords
from app.nlp.ngram import train as train_ngram
from app.nlp.normalize import normalize_text
from app.nlp.parse import parse
from app.nlp.tokenize import tokenize

router = APIRouter(prefix="/nlp", tags=["nlp"])


class TextIn(BaseModel):
    text: str


class TokenizeResult(BaseModel):
    sentences: list[str]
    words: list[str]


@router.post("/tokenize", response_model=TokenizeResult)
def nlp_tokenize(body: TextIn) -> TokenizeResult:
    return TokenizeResult(**tokenize(body.text))


class NormalizedToken(BaseModel):
    token: str
    stem: str
    lemma: str


class NormalizeResult(BaseModel):
    tokens: list[NormalizedToken]


@router.post("/normalize", response_model=NormalizeResult)
def nlp_normalize(body: TextIn) -> NormalizeResult:
    return NormalizeResult(tokens=normalize_text(body.text))


class KeywordsIn(BaseModel):
    text: str
    top_n: int = Field(default=10, ge=1, le=100)


class KeywordCount(BaseModel):
    word: str
    count: int


class PosTag(BaseModel):
    token: str
    pos: str


class KeywordsResult(BaseModel):
    top_keywords: list[KeywordCount]
    pos_tags: list[PosTag]


@router.post("/keywords", response_model=KeywordsResult)
def nlp_keywords(body: KeywordsIn) -> KeywordsResult:
    return KeywordsResult(**keywords(body.text, body.top_n))


class Dependency(BaseModel):
    text: str
    dep: str
    head: str
    pos: str


class ActionItem(BaseModel):
    sentence: str
    trigger: str


class ParseResult(BaseModel):
    noun_phrases: list[str]
    dependencies: list[Dependency]
    action_items: list[ActionItem]


@router.post("/parse", response_model=ParseResult)
def nlp_parse(body: TextIn) -> ParseResult:
    return ParseResult(**parse(body.text))


class PredictIn(BaseModel):
    corpus: str
    prefix: str
    top_n: int = Field(default=5, ge=1, le=50)


class Candidate(BaseModel):
    word: str
    probability: float


class Prediction(BaseModel):
    candidates: list[Candidate]
    backoff: str


@router.post("/predict", response_model=Prediction)
def nlp_predict(body: PredictIn) -> Prediction:
    model = train_ngram(body.corpus)
    return Prediction(**model.predict_next(body.prefix, body.top_n))


class SentenceProbIn(BaseModel):
    corpus: str
    sentence: str


class SentenceProbability(BaseModel):
    tokens: list[str]
    log_prob: float
    perplexity: float


@router.post("/sentence-probability", response_model=SentenceProbability)
def nlp_sentence_probability(body: SentenceProbIn) -> SentenceProbability:
    model = train_ngram(body.corpus)
    return SentenceProbability(**model.sentence_probability(body.sentence))
