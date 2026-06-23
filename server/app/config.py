"""Typed application settings, loaded from the environment / a local .env file.

Defaults are tuned for the target host (8GB RAM, CPU only, int8). All values
are overridable via environment variables of the same name (case-insensitive).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "scribe-nlp"
    host: str = "0.0.0.0"
    port: int = 8000

    # faster-whisper ASR (consumed from Phase 2 onward). Two model tiers:
    # a fast one for live captions, a more accurate one for the final pass.
    # English-only (.en) by default; multilingual models are selected when
    # translation lands (Phase 7).
    whisper_model_live: str = "base.en"
    whisper_model_final: str = "small.en"
    device: str = "cpu"
    compute_type: str = "int8"


settings = Settings()
