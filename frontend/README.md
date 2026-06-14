# frontend/

The web dashboard — scribe's user-facing surface.

## Stack
- **Next.js** + **TypeScript**

## Responsibilities
- Live captions in real time, grouped and labelled per speaker (via the bot's WebSocket)
- Browse session & transcript history
- View structured meeting summaries
- Search transcripts (keyword and meaning-based)
- Toggle between original and translated text

The frontend is a thin client of the bot's HTTP API + WebSocket; it holds no
business logic of its own.

## Setup
_To be scaffolded._
