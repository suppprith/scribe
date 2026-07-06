"""Transcription service: turns 16 kHz mono WAV bytes into structured results."""

from __future__ import annotations

import io
import math
import wave

import numpy as np

from app.asr.engine import get_model
from app.asr.schemas import AsrResult, Segment, Word
from app.config import settings
from app.logging import get_logger

log = get_logger("scribe.asr")


def _wav_stats(data: bytes) -> tuple[float, float]:
    """Return (duration_seconds, peak_amplitude_0_1) for a PCM WAV."""
    with wave.open(io.BytesIO(data), "rb") as wf:
        nframes = wf.getnframes()
        rate = wf.getframerate()
        width = wf.getsampwidth()
        duration = nframes / float(rate) if rate else 0.0
        raw = wf.readframes(nframes)

    peak = 0.0
    if width == 2 and raw:
        samples = np.frombuffer(raw, dtype="<i2")
        if samples.size:
            peak = float(np.max(np.abs(samples))) / 32768.0
    return duration, peak


def _resolve_language(language: str | None) -> str | None:
    value = (language or settings.asr_default_language or "").strip().lower()
    return None if value in ("", "auto") else value


def transcribe(audio: bytes, *, model_name: str, language: str | None = None) -> AsrResult:
    """Transcribe WAV bytes with the named model. Empty/too-short/near-silent
    audio short-circuits to an empty result without invoking the model, and
    unparseable (garbage) input yields an empty result rather than a 500 — a
    bad chunk must never take down a live session."""
    lang = _resolve_language(language)

    try:
        duration, peak = _wav_stats(audio)
    except Exception as exc:  # wave.Error, EOFError, struct errors on garbage
        log.warning("unparseable audio (%d bytes): %s — returning empty result", len(audio), exc)
        return AsrResult(
            text="",
            language=lang or "",
            language_probability=0.0,
            duration=0.0,
            confidence=0.0,
        )

    if duration * 1000.0 < settings.asr_min_audio_ms or peak < settings.asr_silence_peak:
        log.debug("short-circuit: duration=%.3fs peak=%.4f", duration, peak)
        return AsrResult(
            text="",
            language=lang or "",
            language_probability=0.0,
            duration=duration,
            confidence=0.0,
        )

    model = get_model(model_name)
    segment_iter, info = model.transcribe(
        io.BytesIO(audio),
        language=lang,
        beam_size=settings.asr_beam_size,
        word_timestamps=True,
        vad_filter=True,
    )

    segments: list[Segment] = []
    words: list[Word] = []
    logprobs: list[float] = []
    for seg in segment_iter:
        seg_words = [
            Word(word=w.word, start=w.start, end=w.end, probability=w.probability)
            for w in (seg.words or [])
        ]
        words.extend(seg_words)
        segments.append(
            Segment(
                id=seg.id,
                start=seg.start,
                end=seg.end,
                text=seg.text,
                avg_logprob=seg.avg_logprob,
                no_speech_prob=seg.no_speech_prob,
                words=seg_words,
            )
        )
        logprobs.append(seg.avg_logprob)

    text = "".join(s.text for s in segments).strip()
    confidence = math.exp(sum(logprobs) / len(logprobs)) if logprobs else 0.0

    return AsrResult(
        text=text,
        language=info.language,
        language_probability=info.language_probability,
        duration=info.duration,
        confidence=confidence,
        segments=segments,
        words=words,
    )
