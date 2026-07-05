import type { MeetingSummary, SearchMode } from "@scribe/shared";
import { sessions, summaries } from "../db";
import { createTranslator } from "../transcription";
import { toSessionDetail, toSessionListItem, toSessionTranscript } from "./mappers";
import { searchTranscript } from "./search";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function notFound(message = "not found"): Response {
  return json({ error: message }, 404);
}

export interface HttpServer {
  readonly port: number;
  stop(): void;
}

/**
 * The bot's read-only HTTP API. Serves the web client sessions, transcripts,
 * and summaries straight from SQLite. CORS is open so the Next.js dev server
 * (a different origin) can call it directly. Routes:
 *
 *   GET /health
 *   GET /api/sessions                     → SessionListItem[] (newest first)
 *   GET /api/sessions/:id                 → SessionDetail
 *   GET /api/sessions/:id/transcript      → SessionTranscript
 *   GET /api/sessions/:id/summary         → MeetingSummary (404 if not generated)
 *   GET /api/sessions/:id/search?q=&mode= → SearchResponse (keyword | semantic)
 *   POST /api/translate { text, src, tgt? }  → { translatedText, src, tgt }
 */
export function startHttpServer(opts: { port: number; nlpServiceUrl: string }): HttpServer {
  // Cached translator for the on-demand UI endpoint (dedupes repeat requests).
  const translator = createTranslator(opts.nlpServiceUrl);

  const server = Bun.serve({
    port: opts.port,
    async fetch(req) {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      // On-demand translation for the web UI (Original ⇄ English toggle).
      if (req.method === "POST" && path === "/api/translate") {
        let body: { text?: unknown; src?: unknown; tgt?: unknown };
        try {
          body = (await req.json()) as { text?: unknown; src?: unknown; tgt?: unknown };
        } catch {
          return json({ error: "invalid JSON body" }, 400);
        }
        const text = typeof body.text === "string" ? body.text : "";
        const src = typeof body.src === "string" ? body.src : "";
        const tgt = typeof body.tgt === "string" && body.tgt ? body.tgt : "en";
        if (!text || !src) return json({ error: "text and src are required" }, 400);
        const result = await translator(text, src, tgt);
        return result ? json(result) : json({ error: "translation unavailable" }, 502);
      }

      if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
      if (path === "/health") return new Response("ok", { headers: CORS_HEADERS });

      if (path === "/api/sessions") {
        return json(sessions.listRecent().map(toSessionListItem));
      }

      // /api/sessions/:id[/transcript|/summary|/search]
      const match = /^\/api\/sessions\/([^/]+)(?:\/(transcript|summary|search))?$/.exec(path);
      if (match) {
        const id = decodeURIComponent(match[1]!);
        const sub = match[2];
        const session = sessions.get(id);
        if (!session) return notFound("session not found");

        if (sub === "transcript") return json(toSessionTranscript(id));
        if (sub === "summary") {
          const summary = summaries.get<MeetingSummary>(id)?.structured ?? null;
          return summary ? json(summary) : notFound("summary not generated");
        }
        if (sub === "search") {
          const query = (url.searchParams.get("q") ?? "").trim();
          if (!query) return json({ error: "missing query ?q=" }, 400);
          const mode: SearchMode = url.searchParams.get("mode") === "semantic" ? "semantic" : "keyword";
          try {
            const result = await searchTranscript(
              opts.nlpServiceUrl,
              toSessionTranscript(id).lines,
              query,
              mode,
            );
            return json(result);
          } catch (err) {
            return json({ error: `search failed: ${(err as Error).message}` }, 502);
          }
        }
        return json(toSessionDetail(session));
      }

      return notFound();
    },
  });

  return {
    get port() {
      return server.port ?? opts.port;
    },
    stop: () => server.stop(true),
  };
}
