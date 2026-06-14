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
_To be scaffolded._
