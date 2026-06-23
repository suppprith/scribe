"""Entry point for the scribe NLP service.

Run from the ``server/`` directory:

    uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI

from app.api.routes import router
from app.config import settings

app = FastAPI(title="scribe NLP service", version="0.0.0")
app.include_router(router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}
