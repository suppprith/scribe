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
cp .env.example .env
```

Run the service:

```bash
uvicorn app.main:app --reload --port 8000
```

Then `GET http://localhost:8000/health` returns `{"status":"ok",...}`.

Only the web framework + config deps are pinned for now; the ML stack
(faster-whisper, NLTK, spaCy, gensim, scikit-learn) is added in its own
Phase 2 tickets so the scaffold installs fast.
