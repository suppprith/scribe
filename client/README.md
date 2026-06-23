# client/

The web dashboard — scribe's user-facing surface.

## Stack
- **Next.js** + **TypeScript**

## Responsibilities
- Live captions in real time, grouped and labelled per speaker (via the bot's WebSocket)
- Browse session & transcript history
- View structured meeting summaries
- Search transcripts (keyword and meaning-based)
- Toggle between original and translated text

The client is a thin consumer of the bot's HTTP API + WebSocket; it holds no
business logic of its own.

## Setup

From the repo root, install all workspaces once:

```bash
bun install
```

Then run the dashboard:

```bash
cp client/.env.example client/.env
bun run --filter @scribe/client dev   # http://localhost:3000
# or, from this folder:
cd client && bun run dev
```

`bun run build` / `bun run start` for a production build. The shared types
package (`@scribe/shared`) is consumed directly via the workspace and
transpiled by Next (`transpilePackages`).
