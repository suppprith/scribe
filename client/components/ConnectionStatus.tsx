"use client";

/**
 * Live connection indicator for the bot's WebSocket. Opens a session-less
 * socket purely to reflect reachability — a small dot + label that turns green
 * when connected and amber while (re)connecting.
 */
import clsx from "clsx";
import { useSocket } from "@/lib/useSocket";

const LABELS = {
  open: "Connected",
  connecting: "Connecting…",
  closed: "Offline",
} as const;

export function ConnectionStatus() {
  const { status } = useSocket();

  return (
    <span
      className="inline-flex items-center gap-2 text-sm text-muted"
      title={`Bot WebSocket: ${status}`}
      aria-live="polite"
    >
      <span
        className={clsx(
          "size-2.5 rounded-full transition-colors",
          status === "open" && "bg-online shadow-[0_0_0_3px_rgba(62,207,142,0.18)]",
          status === "connecting" && "animate-pulse bg-warn",
          status === "closed" && "bg-offline",
        )}
      />
      {LABELS[status]}
    </span>
  );
}
