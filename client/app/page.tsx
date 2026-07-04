"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { API_URL, WS_URL } from "@/lib/env";
import { useSocket } from "@/lib/useSocket";

/**
 * Landing / health surface. The live-captions view (SUP-31) will render here
 * once a session is selected; for now it verifies the two connections this
 * client depends on — the bot's HTTP API and its caption WebSocket.
 */
export default function Home() {
  const { status } = useSocket();
  const [apiUp, setApiUp] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const ok = await api.health();
      if (alive) setApiUp(ok);
    };
    void check();
    const id = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Live captions</h1>
        <p className="text-muted">
          Real-time, per-speaker captions will stream here while a voice channel is being recorded.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <StatusCard
          label="Bot WebSocket"
          detail={WS_URL}
          state={status === "open" ? "up" : status === "connecting" ? "pending" : "down"}
          text={status === "open" ? "Connected" : status === "connecting" ? "Connecting…" : "Offline"}
        />
        <StatusCard
          label="Bot HTTP API"
          detail={API_URL}
          state={apiUp === null ? "pending" : apiUp ? "up" : "down"}
          text={apiUp === null ? "Checking…" : apiUp ? "Reachable" : "Unreachable"}
        />
      </section>

      <p className="text-sm text-muted">
        Waiting for an active session. Start recording a voice channel in Discord and captions will
        appear here.
      </p>
    </div>
  );
}

function StatusCard({
  label,
  detail,
  state,
  text,
}: {
  label: string;
  detail: string;
  state: "up" | "down" | "pending";
  text: string;
}) {
  const dot =
    state === "up" ? "bg-online" : state === "pending" ? "animate-pulse bg-warn" : "bg-error";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <span className={`size-2.5 rounded-full ${dot}`} />
          {text}
        </span>
      </div>
      <p className="mt-2 truncate font-mono text-xs text-muted">{detail}</p>
    </div>
  );
}
