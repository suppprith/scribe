"""Entry point for the scribe NLP service.

Run from the ``server/`` directory:

    uvicorn app.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI

from app.api.asr import router as asr_router
from app.api.routes import router
from app.config import settings
from app.logging import configure_logging, get_logger

configure_logging()
log = get_logger("scribe.nlp")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    log.info(
        "NLP service starting: asr live=%s final=%s device=%s compute=%s",
        settings.whisper_model_live,
        settings.whisper_model_final,
        settings.device,
        settings.compute_type,
    )
    yield


app = FastAPI(title="scribe NLP service", version="0.0.0", lifespan=lifespan)
app.include_router(router)
app.include_router(asr_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}
