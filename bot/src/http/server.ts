import type { MeetingSummary } from "@scribe/shared";
import { sessions, summaries } from "../db";
import { toSessionDetail, toSessionListItem, toSessionTranscript } from "./mappers";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
 */
export function startHttpServer(opts: { port: number }): HttpServer {
  const server = Bun.serve({
    port: opts.port,
    fetch(req) {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
      if (path === "/health") return new Response("ok", { headers: CORS_HEADERS });

      if (path === "/api/sessions") {
        return json(sessions.listRecent().map(toSessionListItem));
      }

      // /api/sessions/:id[/transcript|/summary]
      const match = /^\/api\/sessions\/([^/]+)(?:\/(transcript|summary))?$/.exec(path);
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
