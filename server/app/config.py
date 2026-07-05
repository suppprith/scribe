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

    # faster-whisper ASR. Two tiers: a fast model for live captions and a more
    # accurate one for the final pass. Defaults are MULTILINGUAL (no .en suffix)
    # so English, Hindi, and Thai all work; set the *.en variants for an
    # English-only fast path. device=cpu + compute=int8 suits the 8GB host.
    whisper_model_live: str = "base"
    whisper_model_final: str = "small"
    device: str = "cpu"
    compute_type: str = "int8"

    # ASR behaviour
    asr_default_language: str = "auto"  # "auto" = let Whisper detect
    asr_beam_size: int = 5
    asr_min_audio_ms: int = 200  # shorter clips are treated as empty
    asr_silence_peak: float = 0.01  # peak amplitude (0..1) below which = silence

    # Translation (MarianMT via CTranslate2, int8). Converted models live under
    # this directory, one per model name (see scripts/download_models.py). Reuses
    # `device`/`compute_type` above so it shares the ASR runtime profile.
    translation_models_dir: str = "./models"


settings = Settings()
