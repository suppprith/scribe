"""Top-level routes. Capability routers (ASR, NLP modules) are mounted here as
they land in later phases."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def root() -> dict[str, str]:
    return {"service": "scribe-nlp", "status": "scaffolded"}
