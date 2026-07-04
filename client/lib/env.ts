/**
 * Client-side environment. All values are `NEXT_PUBLIC_*` so they are inlined
 * into the browser bundle at build time. Read them through this module rather
 * than touching `process.env` directly so defaults live in one place.
 */

/** Base URL of the bot's HTTP API (sessions / transcripts / summaries). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/** Base URL of the bot's WebSocket server (live captions / status). */
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";

/** Optional shared token the WS server may require as `?token=`. */
export const WS_TOKEN = process.env.NEXT_PUBLIC_WS_TOKEN || undefined;
