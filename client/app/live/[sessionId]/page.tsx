"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { LiveCaptions } from "@/components/LiveCaptions";
import { SpeakerAvatar } from "@/components/SpeakerAvatar";
import { useLiveCaptions } from "@/lib/useLiveCaptions";

export default function LiveViewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { status, sessionStatus, participants, captions } = useLiveCaptions(sessionId);

  const live = sessionStatus === "active";
  const activeSpeakers = participants.filter((p) => p.leftAt == null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/sessions" className="text-sm text-muted hover:text-fg">
          ← All sessions
        </Link>
        <ConnectionPill status={status} />
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Live captions</h1>
          {live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-online/15 px-2 py-0.5 text-xs font-medium text-online">
              <span className="size-1.5 animate-pulse rounded-full bg-online" /> Live
            </span>
          ) : sessionStatus === "ended" ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Ended</span>
          ) : null}
        </div>

        {participants.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {participants.map((p) => {
              const speaking = p.leftAt == null;
              return (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 text-sm"
                  style={{ opacity: speaking ? 1 : 0.4 }}
                >
                  <SpeakerAvatar userId={p.id} name={p.name} size={24} />
                  {p.name}
                </span>
              );
            })}
            <span className="text-sm text-muted">
              · {activeSpeakers.length} in channel
            </span>
          </div>
        )}
      </header>

      <LiveCaptions captions={captions} live={live} />

      {sessionStatus === "ended" && (
        <p className="text-sm text-muted">
          This session has ended.{" "}
          <Link href={`/sessions/${sessionId}`} className="text-accent hover:underline">
            Open the full transcript →
          </Link>
        </p>
      )}
    </div>
  );
}

function ConnectionPill({ status }: { status: "open" | "connecting" | "closed" }) {
  const map = {
    open: { text: "Connected", dot: "bg-online" },
    connecting: { text: "Connecting…", dot: "animate-pulse bg-warn" },
    closed: { text: "Offline", dot: "bg-offline" },
  } as const;
  const { text, dot } = map[status];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <span className={`size-2.5 rounded-full ${dot}`} />
      {text}
    </span>
  );
}
