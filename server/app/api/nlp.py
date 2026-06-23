"""HTTP endpoints for the NLP capability modules."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.nlp.normalize import normalize_text
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
