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
