# Demo script & manual test pass

A repeatable, end-to-end walkthrough of scribe — plus the edge-case checklist to
run before showing it to anyone. For setup of each service, see the root
[README](../README.md).

## 0. Preflight

Three terminals:

```bash
# 1 — NLP service (server/)
cd server && .venv/Scripts/activate && uvicorn app.main:app --port 8000

# 2 — bot (repo root)
bun run dev:bot

# 3 — web app (repo root)
bun run dev:client
```

Confirm before starting:

- [ ] `http://localhost:8000/health` returns `{"status":"ok", ...}`
- [ ] Bot log shows `bot online as …` and `registered … slash command(s)`
- [ ] Web app loads at `http://localhost:3000`
- [ ] In Discord: `/scribe status` replies with **NLP service: 🟢 online**

One-time Discord config (persists in SQLite):

- [ ] `/scribe watch #<voice-channel>` — the channel to auto-record
- [ ] `/scribe set-summary-channel #<text-channel>` — where summaries post
- [ ] `/scribe list` shows both

## 1. Happy path (~5 minutes)

1. **Join the watched voice channel.** The bot joins within a second or two and
   the log prints `session <id> started`.
2. **Open the web app → Sessions.** The new session shows as **Live**; click
   through to **Watch live**.
3. **Speak a few sentences** (two speakers is more convincing — captions are
   attributed per user). Captions appear on the live page within a few seconds
   of each utterance ending.
4. *(Optional, if a second speaker has a configured language)*
   `/scribe lang @user <language>` beforehand — their captions carry a language
   badge and an English translation toggle.
5. **Everyone leaves the channel.** After the ~30 s grace period the session
   ends; the log prints `session <id> ended`.
6. **Summary posts to Discord** in the summary channel: overview, topics,
   decisions, action items, participants, duration — and, if Google Drive is
   configured, **Links** to the recording, transcript, and summary files.
7. **Web app → the session page** now shows the ended session: full transcript
   per speaker, the summary page, and the Drive links.
8. *(If Drive is configured)* open the Drive folder — `<guild>/<date_session>/`
   contains `recording.wav`, `transcript.txt`, `summary.md`.

## 2. Offline demo (no live call needed)

Seed a finished session with three speakers, a translated turn, a transcript,
and a full summary:

```bash
cd bot && bun run seed:demo
```

Then start only the bot (for its HTTP API) and the web app — no live call
needed. The web app shows the demo session in history with its transcript,
per-speaker view, and summary. (Transcript search — keyword and semantic — also
works on the seeded session if the NLP service is running.) Re-run the command
to reset it after playing with the data.

## 3. Manual test checklist

Run each; all should pass without a crash or a stuck session.

**Audio edge cases**
- [ ] **Silence only** — join, stay muted 30 s, leave. Session ends cleanly;
      log prints `produced no captions — skipping summary`; no Discord post.
- [ ] **Single speaker** — full happy path with one person; summary attributes
      everything to them.
- [ ] **Very short utterance** ("hi") — either a caption or a clean skip
      (below `asr_min_audio_ms`), never an error.
- [ ] **Overlapping speakers** — two people talk at once; both captioned and
      attributed separately.

**Session lifecycle**
- [ ] **Mid-session join** — a second user joins partway; they appear in
      participants and their speech is captioned from then on.
- [ ] **Mid-session leave + rejoin within grace** — leave and return within
      30 s; the session does *not* split in two.
- [ ] **Channel move** — move from one watched channel to another; the old
      session ends (after grace), a new one starts.
- [ ] **`/scribe unwatch` during a session** — recording continues for the
      running session; no new session starts on the next join.

**Failure injection**
- [ ] **NLP service down mid-session** — Ctrl-C the uvicorn process while
      speaking, restart it within ~10 s. Chunk retries bridge the gap (watch
      `scribe.retry` warnings) and captions resume; nothing crashes.
- [ ] **NLP service down at session end** — kill it, end the session, restart
      it within ~15 s. The summarize retry rides it out; summary still posts.
- [ ] **NLP service down, stays down** — `/scribe status` reports
      🔴 unreachable; the failure notice (not a crash) posts to the summary
      channel at session end.
- [ ] **Bot restart mid-meeting** — Ctrl-C the bot while people are in the
      channel, start it again. Boot closes the stale session (`closed 1 stale
      session(s)`), then `resumed recording for N user(s)` starts a fresh one.
- [ ] **Drive not configured** — with the Google env vars blank, everything
      works; log prints `Google Drive storage disabled`.

**Logs sanity**
- [ ] Bot and NLP-service logs share the `timestamp LEVEL [scope] message`
      shape, and a session id appears in every session-scoped line — a failed
      session can be reconstructed from the two logs alone.
