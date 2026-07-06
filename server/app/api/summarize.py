"""The /summarize endpoint: a full transcript in, a structured summary out."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.pipeline.summarize import summarize

router = APIRouter(tags=["summarize"])


class Utterance(BaseModel):
    speaker: str
    text: str


class SummarizeIn(BaseModel):
    transcript: str | None = None
    # Optional per-speaker utterances; if given, used to build the merged
    # transcript and derive participants when those aren't supplied directly.
    utterances: list[Utterance] = []
    participants: list[str] = []
    duration_seconds: float | None = None


class SummarizeResult(BaseModel):
    overview: str
    topics: list[str]
    keywords: list[str]
    decisions: list[str]
    action_items: list[str]
    highlights: list[str]
    prose: str


@router.post("/summarize", response_model=SummarizeResult)
async def summarize_endpoint(body: SummarizeIn) -> SummarizeResult:
    transcript = body.transcript
    participants = list(body.participants)

    if body.utterances:
        if not transcript:
            transcript = " ".join(u.text for u in body.utterances)
        if not participants:
            seen: list[str] = []
            for u in body.utterances:
                if u.speaker not in seen:
                    seen.append(u.speaker)
            participants = seen

    result = await run_in_threadpool(
        summarize, transcript or "", participants, body.duration_seconds
    )
    return SummarizeResult(**result)
