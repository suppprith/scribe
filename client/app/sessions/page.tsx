"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionListItem } from "@scribe/shared";
import { SpeakerAvatar } from "@/components/SpeakerAvatar";
import { api } from "@/lib/api";
import { formatDateTime, formatDuration } from "@/lib/format";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listSessions()
      .then((s) => alive && setSessions(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-muted">Past and in-progress recordings, newest first.</p>
      </header>

      {error && (
        <p className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          Couldn&apos;t load sessions: {error}
        </p>
      )}

      {!error && sessions === null && <p className="text-muted">Loading…</p>}

      {sessions?.length === 0 && (
        <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-muted">
          No sessions yet. Recordings appear here once the bot joins a voice channel.
        </p>
      )}

      <ul className="space-y-3">
        {sessions?.map((s) => (
          <li key={s.id}>
            <SessionRow session={s} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionRow({ session }: { session: SessionListItem }) {
  const live = session.status === "active";
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50">
      <Link href={`/sessions/${session.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{formatDateTime(session.startedAt)}</span>
          {live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-online/15 px-2 py-0.5 text-xs font-medium text-online">
              <span className="size-1.5 animate-pulse rounded-full bg-online" /> Live
            </span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Ended</span>
          )}
          {session.hasSummary && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">Summary</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted">
          <span>{formatDuration(session.durationMs)}</span>
          <span>·</span>
          <span>
            {session.participants.length} participant{session.participants.length === 1 ? "" : "s"}
          </span>
        </div>
      </Link>

      <div className="flex items-center -space-x-1.5">
        {session.participants.slice(0, 5).map((p) => (
          <SpeakerAvatar key={p.id} userId={p.id} name={p.name} size={26} />
        ))}
      </div>

      {live && (
        <Link
          href={`/live/${session.id}`}
          className="rounded-md bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25"
        >
          Watch live
        </Link>
      )}
    </div>
  );
}
