"""Speech-to-text via faster-whisper (CPU + int8)."""

from app.asr.schemas import AsrResult, Segment, Word
from app.asr.service import transcribe

__all__ = ["AsrResult", "Segment", "Word", "transcribe"]
