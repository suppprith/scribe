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

## ASR (speech-to-text)

faster-whisper on CPU + int8 (CTranslate2). Two endpoints, two model tiers:

| Endpoint | Use | Model (default) |
|----------|-----|-----------------|
| `POST /asr/chunk` | Live captions — one short WAV per call | `WHISPER_MODEL_LIVE` (`base`) |
| `POST /asr/file` | Final accurate pass — full recording | `WHISPER_MODEL_FINAL` (`small`) |

Both take a multipart `file` (16 kHz mono WAV — what the bot produces) and an
optional `language` form field (an ISO code like `en`/`hi`/`th`, or `auto` to
detect). The response is `{ text, language, language_probability, duration,
confidence, segments[], words[] }` with per-word timestamps. Empty, too-short
(`ASR_MIN_AUDIO_MS`), or near-silent (`ASR_SILENCE_PEAK`) audio short-circuits to
an empty result without invoking the model. Models lazy-load on first use and
stay warm.

### Model trade-offs

Defaults are **multilingual** (`base`/`small`) so English, Hindi, and Thai all
work. The `.en` models (`base.en`, `small.en`) are faster and a touch more
accurate but **English-only** — use them only for English-only servers.

| Model | Params | ~RAM (int8) | Speed | Accuracy |
|-------|--------|-------------|-------|----------|
| `tiny` / `tiny.en` | 39M | ~0.2 GB | fastest | lowest |
| `base` / `base.en` | 74M | ~0.3 GB | fast | good — live default |
| `small` / `small.en` | 244M | ~0.7 GB | slower | better — final default |

On the 8 GB host, `base` live + `small` final keeps peak RAM well within budget
alongside the bot and (later) the MT models.

## NLP modules

Each language capability is a pure-function module in [`app/nlp/`](app/nlp),
reused by both an HTTP endpoint (`app/api/nlp.py`) and a standalone demo script
(`scripts/nlp/`) you can run directly to see sample input/output.

| Capability | Endpoint | Demo | Powers |
|------------|----------|------|--------|
| Tokenization | `POST /nlp/tokenize` | `scripts/nlp/tokenize_demo.py` | transcript segmentation |
| Normalization (stem vs lemma) | `POST /nlp/normalize` | `scripts/nlp/normalize_demo.py` | search / keyword matching |
| Keywords (freq + stopwords + POS) | `POST /nlp/keywords` | `scripts/nlp/keywords_demo.py` | keyword/topic extraction, summaries |
| Parsing (constituency + dependency) | `POST /nlp/parse` | `scripts/nlp/parse_demo.py` | action-item / imperative detection |
| N-gram language model | `POST /nlp/predict`, `/nlp/sentence-probability` | `scripts/nlp/ngram_demo.py` | phrase modeling over transcripts |
| Word-sense disambiguation (Lesk) | `POST /nlp/disambiguate` | `scripts/nlp/wordnet_demo.py` | in-meeting glossary / definitions |
| IR search (TF-IDF + P/R/F/MAP) | `POST /nlp/search`, `/nlp/ir-metrics` | `scripts/nlp/ir_demo.py` | transcript search + extractive ranking |
| Template NLG summarizer | `POST /nlp/nlg` | `scripts/nlp/nlg_demo.py` | meeting summaries (no external LLM) |

### Summarization pipeline

`POST /summarize` chains the modules into one structured summary — the full
custom replacement for an external LLM:

```
tokenize → keywords/POS → action items (parse) → extractive highlights (TF-IDF) → template NLG
```

Send a `transcript` (and/or per-speaker `utterances`, optional `participants`
and `duration_seconds`); get back `{ overview, topics, keywords, decisions,
action_items, highlights, prose }`. Deterministic, CPU-only, and graceful on
short/empty input. Demo: `python scripts/summarize_demo.py`.

```bash
python scripts/nlp/tokenize_demo.py
python scripts/nlp/normalize_demo.py
python scripts/nlp/keywords_demo.py
python scripts/nlp/parse_demo.py
python scripts/nlp/ngram_demo.py
python scripts/nlp/wordnet_demo.py
python scripts/nlp/ir_demo.py
python scripts/nlp/nlg_demo.py
```
