"""ASR HTTP endpoints: live chunk transcription and final-pass file transcription."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.asr.schemas import AsrResult
from app.asr.service import transcribe
from app.config import settings

router = APIRouter(prefix="/asr", tags=["asr"])


@router.post("/chunk", response_model=AsrResult)
async def asr_chunk(
    file: UploadFile = File(...),
    language: str = Form(default="auto"),
) -> AsrResult:
    """Live captions: fast model, one short WAV chunk per call."""
    audio = await file.read()
    return await run_in_threadpool(
        transcribe, audio, model_name=settings.whisper_model_live, language=language
    )


@router.post("/file", response_model=AsrResult)
async def asr_file(
    file: UploadFile = File(...),
    language: str = Form(default="auto"),
) -> AsrResult:
    """Final accurate pass: larger model, a full recording per call."""
    audio = await file.read()
    return await run_in_threadpool(
        transcribe, audio, model_name=settings.whisper_model_final, language=language
    )
