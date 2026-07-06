"""Orchestration that chains ASR + NLP modules into transcripts and summaries."""

from app.pipeline.summarize import summarize

__all__ = ["summarize"]
