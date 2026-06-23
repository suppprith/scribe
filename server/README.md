# server/

The NLP service — all speech and language processing for scribe.

## Stack
- **Python** + **FastAPI**
- **faster-whisper** (CTranslate2, CPU/int8) for speech-to-text
- **MarianMT** via **CTranslate2** for translation
- **NLTK**, **spaCy**, **gensim**, **scikit-learn** for text analysis

## Responsibilities
- Transcribe audio chunks (and full recordings) to text, with speaker timing
- Translate non-English text
- Provide the NLP capabilities scribe is built from: tokenization, normalization,
  keyword/POS extraction, parsing, n-gram modeling, word-sense disambiguation,
  information-retrieval search, and word embeddings
- Generate structured meeting summaries with a template-based NLG engine
  (no external LLM)

Each capability is a self-contained module with both an HTTP endpoint and a
standalone runnable script.

## Setup

From this folder, create an isolated virtual environment and install deps:

```bash
cd server
python -m venv .venv
# Windows:        .venv\Scripts\activate
# macOS / Linux:  source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_models.py   # NLTK data + spaCy en_core_web_sm (one-time)
cp .env.example .env
```

Run the service:

```bash
uvicorn app.main:app --reload --port 8000
```

Then `GET http://localhost:8000/health` returns `{"status":"ok",...}`.

Whisper ASR weights download lazily on first transcription, so they aren't
fetched by the script above. All Python deps ship as wheels (no compiler) and
run on CPU + int8 within the 8 GB budget.

## Layout

```
server/app/
├── main.py        # FastAPI app, lifespan, /health
├── config.py      # typed settings (model names, device, compute type)
├── logging.py     # structured logging
├── api/           # HTTP routers
├── asr/           # speech-to-text (faster-whisper)
├── nlp/           # the NLP capability modules
└── pipeline/      # orchestration (transcript → summary)
scripts/download_models.py   # one-command NLTK + spaCy download
```
