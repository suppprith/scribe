"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { DriveLink, SessionDetail } from "@scribe/shared";
import { LanguageBadge } from "@/components/LanguageBadge";
import { SpeakerAvatar } from "@/components/SpeakerAvatar";
import { TranscriptView } from "@/components/TranscriptView";
import { api } from "@/lib/api";
import { formatDateTime, formatDuration } from "@/lib/format";

const DRIVE_LABELS: Record<DriveLink["kind"], string> = {
  audio: "Audio",
  transcript: "Transcript file",
  summary: "Summary file",
};

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSession(null);
    setError(null);
    api
      .getSession(id)
      .then((s) => alive && setSession(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          Couldn&apos;t load this session: {error}
        </p>
      </div>
    );
  }

  if (!session) return <p className="text-muted">Loading…</p>;

  const live = session.status === "active";

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {formatDateTime(session.startedAt)}
          </h1>
          {live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-online/15 px-2 py-0.5 text-xs font-medium text-online">
              <span className="size-1.5 animate-pulse rounded-full bg-online" /> Live
            </span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Ended</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span>{formatDuration(session.durationMs)}</span>
          <span>·</span>
          <span className="flex items-center gap-2">
            {session.participants.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5">
                <SpeakerAvatar userId={p.id} name={p.name} size={22} />
                {p.name}
                <LanguageBadge code={p.lang} />
              </span>
            ))}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {live && (
            <Link
              href={`/live/${session.id}`}
              className="rounded-md bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25"
            >
              Watch live
            </Link>
          )}
          <Link
            href={`/sessions/${session.id}/summary`}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent/50"
          >
            View summary
          </Link>
          {session.driveLinks.map((link) => (
            <a
              key={link.kind}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent/50"
            >
              {DRIVE_LABELS[link.kind]} ↗
            </a>
          ))}
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-medium">Transcript</h2>
        <TranscriptView
          lines={session.transcript.lines}
          participants={session.participants}
          startedAt={session.startedAt}
        />
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/sessions" className="text-sm text-muted hover:text-fg">
      ← All sessions
    </Link>
  );
}
