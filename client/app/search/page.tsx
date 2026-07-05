"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { SearchMode, SearchResponse, SessionListItem } from "@scribe/shared";
import { SpeakerAvatar } from "@/components/SpeakerAvatar";
import { api } from "@/lib/api";
import { formatClock, formatDateTime } from "@/lib/format";
import { speakerColor } from "@/lib/speaker";

export default function SearchPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listSessions()
      .then((s) => {
        setSessions(s);
        if (s.length > 0) setSessionId(s[0]!.id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!sessionId || !query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await api.search(sessionId, query.trim(), mode));
    } catch (err) {
      setError((err as Error).message);
      setResults(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Search transcripts</h1>
        <p className="text-muted">
          Keyword ranking (TF-IDF) or semantic search that expands your query with related words.
        </p>
      </header>

      <form onSubmit={run} className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            {sessions.length === 0 && <option value="">No sessions</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDateTime(s.startedAt)} · {s.participants.length} participant
                {s.participants.length === 1 ? "" : "s"}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
            <ModeButton active={mode === "keyword"} onClick={() => setMode("keyword")}>
              Keyword
            </ModeButton>
            <ModeButton active={mode === "semantic"} onClick={() => setMode("semantic")}>
              Semantic
            </ModeButton>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this transcript…"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60"
          />
          <button
            type="submit"
            disabled={busy || !sessionId || !query.trim()}
            className="rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </p>
      )}

      {results && <Results results={results} sessionId={sessionId} />}
    </div>
  );
}

function Results({ results, sessionId }: { results: SearchResponse; sessionId: string }) {
  if (results.hits.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-muted">
        No matches for “{results.query}”.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">
        {results.hits.length} result{results.hits.length === 1 ? "" : "s"}
        {results.mode === "semantic" && results.terms.length > 1 && (
          <> · expanded to: {results.terms.slice(0, 8).join(", ")}</>
        )}
      </div>
      <ul className="space-y-2">
        {results.hits.map((hit, i) => (
          <li key={i}>
            <Link
              href={`/sessions/${sessionId}#line-${hit.lineIndex}`}
              className="flex gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
            >
              <SpeakerAvatar userId={hit.userId} name={hit.username} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: speakerColor(hit.userId) }}
                  >
                    {hit.username}
                  </span>
                  <span className="font-mono text-xs text-muted">{formatClock(hit.tsStart)}</span>
                </div>
                <p className="text-fg/90">
                  <Highlighted text={hit.text} terms={results.terms} />
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 transition-colors ${active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
    >
      {children}
    </button>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap any of `terms` found in `text` with a highlight mark. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const clean = terms.filter((t) => t && t.length > 1).map(escapeRegExp);
  if (clean.length === 0) return <>{text}</>;

  const re = new RegExp(`(${clean.join("|")})`, "ig");
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <mark key={m.index} className="rounded bg-accent/25 text-fg">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
