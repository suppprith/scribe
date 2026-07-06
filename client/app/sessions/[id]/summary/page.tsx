"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { MeetingSummary, ServerMessage } from "@scribe/shared";
import { SummaryView } from "@/components/SummaryView";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/useSocket";

export default function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return api
      .getSummary(id)
      .then((s) => {
        setSummary(s);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    let alive = true;
    void load().finally(() => alive);
    return () => {
      alive = false;
    };
  }, [load]);

  // Refetch when the bot signals a fresh summary for this session.
  const onMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === "summary_ready" && message.sessionId === id) void load();
    },
    [id, load],
  );
  useSocket({ sessionId: id, onMessage });

  return (
    <div className="space-y-6">
      <Link href={`/sessions/${id}`} className="text-sm text-muted hover:text-fg">
        ← Back to session
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Summary</h1>

      {error && (
        <p className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          Couldn&apos;t load the summary: {error}
        </p>
      )}

      {!error && !loaded && <p className="text-muted">Loading…</p>}

      {!error && loaded && summary === null && (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center">
          <p className="text-muted">
            No summary yet. It&apos;s generated when the session ends and will appear here
            automatically.
          </p>
        </div>
      )}

      {summary && <SummaryView summary={summary} />}
    </div>
  );
}
