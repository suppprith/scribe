"""Typed application settings, loaded from the environment / a local .env file."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "scribe-nlp"
    host: str = "0.0.0.0"
    port: int = 8000

    # faster-whisper ASR — consumed from Phase 2 onward.
    asr_model: str = "small"
    asr_device: str = "cpu"
    asr_compute_type: str = "int8"


settings = Settings()
