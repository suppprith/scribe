# scribe

**A self-hosted meeting-intelligence assistant for Discord.** scribe automatically joins designated voice channels, records every participant on their own track, and turns live conversation into speaker-attributed captions on a web dashboard. When the call ends it generates a structured summary, posts it to Discord, and archives the audio and transcript to Google Drive.

Everything that touches language — speech-to-text, analysis, translation, and summarization — runs on a **self-hosted NLP pipeline with no paid cloud AI dependencies**. There is no external LLM in the loop; summaries are produced by scribe's own natural-language-generation engine.

## What it does

- **Auto-records the channels you choose.** Admins mark which voice channels scribe should watch. The moment someone joins a watched channel, scribe joins and starts recording — no manual command needed.
- **Per-speaker capture.** Each participant is recorded as a separate audio stream, so every word is correctly attributed to who said it.
- **Live captions on the web.** As people talk, captions stream to a web dashboard in real time, grouped and labelled per speaker.
- **Translation.** Non-English speech is transcribed in its original language and translated, so everyone's contribution is readable in one language.
- **Custom summaries.** When everyone leaves, scribe builds a structured summary — key topics, decisions, action items, and highlights — using its own NLP pipeline, and posts it to the Discord channel and the dashboard.
- **Searchable history.** Past meetings, full transcripts, and summaries are browsable and searchable (both keyword and meaning-based search).
- **Archived to Drive.** Raw audio, transcripts, and summaries are uploaded to Google Drive automatically, with links surfaced in Discord and on the web.

## Architecture

scribe is a monorepo of three cooperating services.

```
┌──────────────────┐   per-speaker audio chunks (HTTP)   ┌────────────────────────┐
│       bot/       │ ──────────────────────────────────► │        backend/        │
│  Bun + discord.js│   ◄──── text · translation ──────── │   Python + FastAPI     │
│                  │   ◄──── summary ─────────────────── │   · speech-to-text     │
│  · voice capture │                                     │   · translation        │
│  · sessions      │                                     │   · NLP analysis       │
│  · WebSocket     │                                     │   · summarization      │
│  · SQLite        │                                     └────────────────────────┘
└────────┬─────────┘
         │ WebSocket (live captions, status, summaries)
         ▼
┌──────────────────┐
│    frontend/     │  live captions per speaker · transcripts · summaries · search
│     Next.js      │
└──────────────────┘
         │
         ▼   Google Drive — audio · transcripts · summaries
```

### Data flow

1. A user joins a watched voice channel → the **bot** auto-joins and begins per-speaker recording, opening a session.
2. The bot slices each speaker's audio into short chunks and sends them to the **backend**, which transcribes (and, where needed, translates) them.
3. Each result is stored (SQLite) and broadcast over a **WebSocket** to the **frontend**, where it appears as a live caption attributed to the speaker.
4. When the last participant leaves, the bot assembles the full transcript and asks the backend to summarize it.
5. The summary is posted to the Discord channel and the dashboard, and the audio, transcript, and summary are archived to **Google Drive**.

### Components

| Folder | Service | Stack | Responsibility |
|--------|---------|-------|----------------|
| `bot/` | Discord bot | Bun, TypeScript, discord.js, @discordjs/voice | Auto-join, per-speaker voice capture, session lifecycle, SQLite store, WebSocket server, Discord delivery |
| `backend/` | NLP service | Python, FastAPI, faster-whisper, MarianMT/CTranslate2, NLTK, spaCy, gensim, scikit-learn | Speech-to-text, translation, text analysis, and summarization |
| `frontend/` | Web dashboard | Next.js, TypeScript | Live captions, transcript & session history, summaries, search |

### Why self-hosted

Speech and language processing both run locally on CPU (int8) via CTranslate2 — the same runtime powers transcription and translation. There is no per-minute API cost, no third party receives the audio, and the whole stack runs on modest hardware.

## NLP capabilities → product features

scribe's language features are built from a set of focused NLP capabilities. Each is a real, self-contained module in `backend/`, and each powers a concrete product feature:

| NLP capability | What it powers in scribe |
|----------------|--------------------------|
| Tokenization & sentence segmentation | Splitting transcripts into clean units for every downstream step |
| Text normalization (stemming & lemmatization) | Robust keyword matching and search |
| Frequency analysis, stop-word filtering & POS tagging | Keyword and topic extraction |
| Syntactic parsing | Action-item and decision detection |
| N-gram language modeling | Phrase modeling and prediction |
| Word-sense disambiguation | In-context glossary and definitions |
| Template-based natural language generation | Meeting summaries (no external LLM) |
| Machine translation | Multilingual transcripts and captions |
| Information retrieval (TF-IDF / vector space) | Transcript search and ranking |
| Word embeddings | Semantic ("meaning-based") search and topic clustering |

## Repository structure

```
scribe/
├── bot/        # Discord bot — voice capture, sessions, WebSocket, SQLite
├── backend/    # NLP service — speech-to-text, translation, analysis, summarization
└── frontend/   # Web dashboard — live captions, transcripts, summaries, search
```

Each service has its own README with setup instructions.

## Status

scribe is under active development. Work is tracked in Linear.

## License

MIT
