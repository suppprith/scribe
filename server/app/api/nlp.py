"""HTTP endpoints for the NLP capability modules."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.nlp.embeddings import most_similar, vectors_for
from app.nlp.ir import TfidfIndex, evaluate
from app.nlp.keywords import keywords
from app.nlp.ngram import train as train_ngram
from app.nlp.nlg import generate_summary
from app.nlp.normalize import normalize_text
from app.nlp.parse import parse
from app.nlp.tokenize import tokenize
from app.nlp.wordnet_wsd import disambiguate

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


class Sense(BaseModel):
    name: str
    definition: str


class AmbiguousWord(BaseModel):
    word: str
    num_senses: int
    senses: list[Sense]
    chosen_sense: Sense | None


class Disambiguation(BaseModel):
    ambiguous: list[AmbiguousWord]


@router.post("/disambiguate", response_model=Disambiguation)
def nlp_disambiguate(body: TextIn) -> Disambiguation:
    return Disambiguation(**disambiguate(body.text))


class SearchIn(BaseModel):
    documents: list[str]
    query: str
    top_n: int = Field(default=5, ge=1, le=100)


class SearchHit(BaseModel):
    index: int
    document: str
    score: float


class SearchResult(BaseModel):
    hits: list[SearchHit]


@router.post("/search", response_model=SearchResult)
def nlp_search(body: SearchIn) -> SearchResult:
    hits = TfidfIndex(body.documents).search(body.query, body.top_n)
    return SearchResult(hits=hits)


class LabeledQuery(BaseModel):
    query: str
    relevant: list[int]


class IrMetricsIn(BaseModel):
    documents: list[str]
    queries: list[LabeledQuery]
    top_n: int = Field(default=5, ge=1, le=100)


class QueryMetrics(BaseModel):
    query: str
    precision: float
    recall: float
    f1: float
    average_precision: float


class IrMetricsResult(BaseModel):
    per_query: list[QueryMetrics]
    mean_precision: float
    mean_recall: float
    mean_f1: float
    mean_average_precision: float


@router.post("/ir-metrics", response_model=IrMetricsResult)
def nlp_ir_metrics(body: IrMetricsIn) -> IrMetricsResult:
    queries = [{"query": q.query, "relevant": q.relevant} for q in body.queries]
    return IrMetricsResult(**evaluate(body.documents, queries, body.top_n))


class ActionItemIn(BaseModel):
    text: str
    owner: str | None = None


class NlgIn(BaseModel):
    participants: list[str] = []
    duration_seconds: float | None = None
    keywords: list[str] = []
    topics: list[str] = []
    decisions: list[str] = []
    action_items: list[ActionItemIn] = []
    highlights: list[str] = []


class NlgResult(BaseModel):
    overview: str
    prose: str


@router.post("/nlg", response_model=NlgResult)
def nlp_nlg(body: NlgIn) -> NlgResult:
    return NlgResult(**generate_summary(body.model_dump(exclude_none=True)))


class EmbeddingsIn(BaseModel):
    documents: list[str]
    words: list[str] = []
    vector_size: int = Field(default=50, ge=8, le=300)
    sg: int = Field(default=0, ge=0, le=1)  # 0 = CBOW, 1 = skip-gram
    min_count: int = Field(default=1, ge=1, le=50)


class EmbeddingsResult(BaseModel):
    vectors: dict[str, list[float]]


@router.post("/embeddings", response_model=EmbeddingsResult)
def nlp_embeddings(body: EmbeddingsIn) -> EmbeddingsResult:
    vectors = vectors_for(
        body.documents,
        body.words or None,
        vector_size=body.vector_size,
        sg=body.sg,
        min_count=body.min_count,
    )
    return EmbeddingsResult(vectors=vectors)


class SimilarIn(BaseModel):
    documents: list[str]
    word: str
    top_n: int = Field(default=10, ge=1, le=50)
    vector_size: int = Field(default=50, ge=8, le=300)
    sg: int = Field(default=0, ge=0, le=1)
    min_count: int = Field(default=1, ge=1, le=50)


class SimilarWord(BaseModel):
    word: str
    score: float


class SimilarResult(BaseModel):
    word: str
    similar: list[SimilarWord]


@router.post("/similar", response_model=SimilarResult)
def nlp_similar(body: SimilarIn) -> SimilarResult:
    similar = most_similar(
        body.documents,
        body.word,
        body.top_n,
        vector_size=body.vector_size,
        sg=body.sg,
        min_count=body.min_count,
    )
    return SimilarResult(word=body.word, similar=similar)
