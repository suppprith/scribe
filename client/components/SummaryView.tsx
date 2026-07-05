"use client";

import { useState } from "react";
import type { MeetingSummary } from "@scribe/shared";
import { summaryToMarkdown } from "@/lib/summaryMarkdown";

/**
 * Structured meeting summary, mirroring the Discord embed: overview, topics,
 * decisions, action items, highlights, and keywords. Includes a copy action
 * that yields the same Markdown.
 */
export function SummaryView({ summary }: { summary: MeetingSummary }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-lg leading-relaxed text-fg/90">{summary.overview}</p>
        <CopyButton summary={summary} />
      </div>

      {summary.topics.length > 0 && (
        <Section title="Topics">
          <div className="flex flex-wrap gap-2">
            {summary.topics.map((t, i) => (
              <span key={i} className="rounded-full bg-surface-2 px-3 py-1 text-sm">
                {t}
              </span>
            ))}
          </div>
        </Section>
      )}

      {summary.decisions.length > 0 && (
        <Section title="Decisions">
          <ul className="space-y-2">
            {summary.decisions.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-online">✓</span>
                <span className="text-fg/90">{d}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.action_items.length > 0 && (
        <Section title="Action items">
          <ul className="space-y-2">
            {summary.action_items.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">→</span>
                <span className="text-fg/90">{a}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.highlights.length > 0 && (
        <Section title="Highlights">
          <ul className="space-y-2">
            {summary.highlights.map((h, i) => (
              <li
                key={i}
                className="border-l-2 border-border pl-3 text-fg/80 italic"
              >
                {h}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.keywords.length > 0 && (
        <Section title="Keywords">
          <div className="flex flex-wrap gap-2">
            {summary.keywords.map((k, i) => (
              <span key={i} className="rounded-md bg-accent/10 px-2 py-0.5 text-sm text-accent">
                {k}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function CopyButton({ summary }: { summary: MeetingSummary }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryToMarkdown(summary));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (e.g. insecure context) — ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent/50"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
