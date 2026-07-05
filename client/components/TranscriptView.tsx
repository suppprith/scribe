"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import type { Participant, TranscriptLine } from "@scribe/shared";
import { SpeakerAvatar } from "@/components/SpeakerAvatar";
import { formatClock } from "@/lib/format";
import { speakerColor } from "@/lib/speaker";

type Mode = "merged" | "by-speaker";

/**
 * The attributed transcript. "Merged" shows time-ordered lines (each anchored
 * as `#line-N` so search results can deep-link to it); "By speaker" groups all
 * of each participant's text together.
 */
export function TranscriptView({
  lines,
  participants,
}: {
  lines: TranscriptLine[];
  participants: Participant[];
}) {
  const [mode, setMode] = useState<Mode>("merged");
  const [highlight, setHighlight] = useState<number | null>(null);

  // Deep-link support: on load / hash change, scroll to and flash `#line-N`.
  useEffect(() => {
    const applyHash = () => {
      const m = /^#line-(\d+)$/.exec(window.location.hash);
      if (!m) return;
      const idx = Number(m[1]);
      setMode("merged");
      setHighlight(idx);
      requestAnimationFrame(() => {
        document.getElementById(`line-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  if (lines.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-muted">
        No transcript yet — this session produced no final captions.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
        <ModeButton active={mode === "merged"} onClick={() => setMode("merged")}>
          Merged
        </ModeButton>
        <ModeButton active={mode === "by-speaker"} onClick={() => setMode("by-speaker")}>
          By speaker
        </ModeButton>
      </div>

      {mode === "merged" ? (
        <ol className="space-y-3">
          {lines.map((line, i) => (
            <li
              key={i}
              id={`line-${i}`}
              className={clsx(
                "flex gap-3 scroll-mt-20 rounded-lg px-2 py-1.5 transition-colors",
                highlight === i && "bg-accent/10 ring-1 ring-accent/40",
              )}
            >
              <SpeakerAvatar userId={line.userId} name={line.username} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium" style={{ color: speakerColor(line.userId) }}>
                    {line.username}
                  </span>
                  <span className="font-mono text-xs text-muted">{formatClock(line.tsStart)}</span>
                </div>
                <p className="text-fg/90">{line.text}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <BySpeaker lines={lines} />
      )}
    </div>
  );
}

function BySpeaker({ lines }: { lines: TranscriptLine[] }) {
  // Group each speaker's utterances, preserving the order they first appear.
  const order: string[] = [];
  const byUser = new Map<string, { name: string; text: string[] }>();
  for (const line of lines) {
    let entry = byUser.get(line.userId);
    if (!entry) {
      entry = { name: line.username, text: [] };
      byUser.set(line.userId, entry);
      order.push(line.userId);
    }
    entry.text.push(line.text);
  }

  return (
    <div className="space-y-5">
      {order.map((userId) => {
        const entry = byUser.get(userId)!;
        return (
          <section key={userId} className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2">
              <SpeakerAvatar userId={userId} name={entry.name} />
              <span className="font-medium" style={{ color: speakerColor(userId) }}>
                {entry.name}
              </span>
            </div>
            <p className="text-fg/90">{entry.text.join(" ")}</p>
          </section>
        );
      })}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-md px-3 py-1.5 transition-colors",
        active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
