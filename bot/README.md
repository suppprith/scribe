# bot/

The Discord bot — the entry point and orchestrator of scribe.

## Stack
- **Bun** + **TypeScript**
- **discord.js** v14 + **@discordjs/voice** for gateway + voice
- **bun:sqlite** for local persistence
- Native **WebSocket** server for pushing live captions to the client

## Responsibilities
- Watch a configurable set of voice channels and auto-join when a user enters one
- Capture each participant on a separate audio stream
- Slice audio into chunks and send them to `server/` for transcription/translation
- Own the session lifecycle (start on join, end when everyone leaves)
- Persist sessions, participants, captions, transcripts, and summaries (SQLite)
- Broadcast live captions / status / summaries to `client/` over WebSocket
- Post the final summary to the configured Discord text channel
- Upload audio, transcripts, and summaries to Google Drive

## Setup

From the repo root, install all workspaces once:

```bash
bun install
```

Then configure and run the bot:

```bash
cp bot/.env.example bot/.env   # fill in DISCORD_TOKEN
bun run --filter @scribe/bot dev     # watch mode
# or, from this folder:
cd bot && bun run dev
```

`bun run start` runs without watch. Type-check with `bun run typecheck`.

## Configuration

Config is read once at boot by [`src/config.ts`](src/config.ts), validated, and
imported as a typed `config` object everywhere (never raw `process.env`). If a
required variable is missing or invalid, the bot prints a single message listing
every problem and exits — see [`.env.example`](.env.example) for all variables.
`DISCORD_TOKEN` is the only hard requirement; the rest have sensible defaults.

## Slash commands

`/scribe` (requires the **Manage Server** permission) configures which voice
channels are auto-recorded, per guild, persisted to `guild_config`:

| Command | Effect |
|---------|--------|
| `/scribe watch <voice-channel>` | Add a voice channel to the auto-record list |
| `/scribe unwatch <voice-channel>` | Remove a voice channel from the list |
| `/scribe list` | Show watched channels + the summary channel |
| `/scribe set-summary-channel <text-channel>` | Set where summaries are posted |

Commands are registered on startup — scoped to `DISCORD_DEV_GUILD_ID` if set
(instant updates), otherwise globally. Registration needs `DISCORD_CLIENT_ID`.

## Recording sessions

[`src/voice/`](src/voice) turns voice activity into sessions. When the first
non-bot user enters a **watched** channel the bot auto-joins and opens a session
row; further users are registered as participants without re-joining. When the
last real user leaves, the session ends after a **grace period** (default 30s) —
a quick rejoin cancels it, so brief disconnects don't split a meeting. Channel
moves are handled as a leave-then-join.

The `SessionManager` keys state by `guild:channel`, so multiple servers and
channels record concurrently in isolation, and channel moves are handled without
orphaning a connection. On end it persists `endedAt`, tears down the voice
connection, and fires an `onSessionEnd` hook — the entry point for the
transcript → summary → storage pipeline (later phases). On `SIGINT`/`SIGTERM`
the bot ends every active session and disconnects cleanly. The voice
gateway and timer scheduler are injectable, which keeps the lifecycle unit-testable
without a live Discord connection.

### Per-speaker capture

While a session is connected, `SessionCapture` subscribes to each speaker
independently via `connection.receiver`. A user's Opus is decoded (prism-media)
and resampled from 48 kHz stereo to **16 kHz mono PCM** — the format Whisper
wants — then emitted as a `CapturedSegment` tagged with `userId`, `username`,
and start/end timestamps when their utterance ends (after ~800 ms of silence).
Each speaker is a separate subscription, so overlapping speech stays cleanly
attributed. Segments flow to an `onSegment` hook, which later phases chunk and
send to the NLP service. (Receiving needs an Opus + encryption backend —
`opusscript` and `libsodium-wrappers` ship as dependencies.)

### Chunking ([`src/audio/`](src/audio))

`AudioChunker` turns each captured utterance into ASR-ready pieces: utterances
longer than ~5s are split at the quietest 20 ms frame between 4–5s, so cuts land
on natural pauses rather than mid-word. Each piece is encoded as a 16 kHz mono
WAV (faster-whisper's input format) and tagged with `sessionId`, `userId`,
`username`, a per-speaker `seq`, and interpolated `tsStart`/`tsEnd`. Chunks are
pushed to a `ChunkQueue` — a bounded async FIFO the transcription loop drains.

### Transcription loop ([`src/transcription/`](src/transcription))

`TranscriptionWorker` drains the chunk queue and, for each chunk, POSTs the WAV
to the NLP service's `/asr/chunk`. Non-empty results become **final** captions:
persisted to the `captions` table and broadcast over the WebSocket, attributed
to the right speaker. A bounded queue (drop-oldest) plus a concurrency limit
keep the single shared CPU from being overwhelmed when several people speak at
once, and per-speaker word-level stitching removes duplicate/overlapping text
across consecutive chunks.

## Live captions (WebSocket)

[`src/ws/`](src/ws) hosts a `Bun.serve` WebSocket server (`WS_PORT`) that pushes
realtime events to the web client. Clients connect to `/ws?session=<id>` (and
`&token=<WS_AUTH_TOKEN>` if configured) and join that session's room; they can
also resubscribe with a `{ type: "subscribe", sessionId }` message. The server
broadcasts the shared `ServerMessage` union (`session_start`, `session_end`,
`participant_update`, `caption`, `summary_ready`) to a session's subscribers
only. The latest participant roster is cached per session, so a reconnecting
client gets the current participants immediately. Rooms are freed when their
last subscriber disconnects.

## Data layer (SQLite)

The bot owns a local SQLite database (`bun:sqlite`, path `DB_PATH`). It is
created and migrated on boot — migrations are idempotent (`CREATE TABLE IF NOT
EXISTS`), so re-running is safe. `PRAGMA foreign_keys = ON` and WAL journaling
are enabled. Conventions: ids are `TEXT`, timestamps are epoch-ms `INTEGER`,
booleans are `0/1`, structured values are JSON `TEXT`.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `guild_config` | Per-guild settings | `guild_id` (PK), `watched_vc_ids` (JSON), `summary_channel_id` |
| `sessions` | One recording session | `id` (PK), `guild_id`, `channel_id`, `status`, `started_at`, `ended_at` |
| `participants` | Speakers in a session | (`session_id`, `user_id`) PK, `username`, `joined_at`, `left_at` |
| `captions` | Live/partial + final captions | `id` (PK), `session_id`, `user_id`, `text`, `ts_start`, `ts_end`, `is_final` |
| `transcripts` | Assembled transcript | `session_id` (PK), `full_text`, `per_user_json` (JSON) |
| `summaries` | Generated summary | `session_id` (PK), `structured_json` (JSON), `posted_to_discord` |
| `drive_links` | Google Drive uploads | `id` (PK), `session_id`, `kind`, `url` |

Child tables reference `sessions(id)` with `ON DELETE CASCADE`.

Each table has a typed repository in [`src/db/repos/`](src/db/repos) — e.g.:

```ts
import { sessions, captions } from "./db";

const s = sessions.create({ id, guildId, channelId });
captions.insert({ sessionId: s.id, userId, username, text, tsStart, tsEnd, isFinal: true });
const finals = captions.listFinal(s.id);
sessions.end(s.id);
```

`initDb()` opens the database and logs its location; call it once at startup.
