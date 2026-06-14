# backend/

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
_To be scaffolded._
