"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionListItem } from "@scribe/shared";
import { SpeakerAvatar } from "@/components/SpeakerAvatar";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";

/**
 * Landing surface. Lists the sessions currently being recorded and links into
 * each live-captions view; falls back to a clear empty state when nothing is
 * live.
 */
export default function Home() {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .listSessions()
        .then((s) => alive && (setSessions(s), setError(null)))
        .catch((e: Error) => alive && setError(e.message));
    void load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const activeSessions = sessions?.filter((s) => s.status === "active") ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Live now</h1>
        <p className="text-muted">Voice channels scribe is currently recording.</p>
      </header>

      {error && (
        <p className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          Can&apos;t reach the bot: {error}
        </p>
      )}

      {!error && sessions === null && <p className="text-muted">Loading…</p>}

      {!error && sessions !== null && activeSessions.length === 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center">
          <p className="text-muted">Nothing live right now.</p>
          <Link href="/sessions" className="mt-2 inline-block text-sm text-accent hover:underline">
            Browse past sessions →
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {activeSessions.map((s) => (
          <li key={s.id}>
            <Link
              href={`/live/${s.id}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-online/15 px-2 py-0.5 text-xs font-medium text-online">
                <span className="size-1.5 animate-pulse rounded-full bg-online" /> Live
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted">
                  {formatDuration(Date.now() - s.startedAt)} ·{" "}
                  {s.participants.length} participant{s.participants.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex items-center -space-x-1.5">
                {s.participants.slice(0, 5).map((p) => (
                  <SpeakerAvatar key={p.id} userId={p.id} name={p.name} size={26} />
                ))}
              </div>
              <span className="text-sm font-medium text-accent">Watch →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
