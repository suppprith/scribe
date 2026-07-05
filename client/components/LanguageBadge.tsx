import { languageName } from "@/lib/lang";

/**
 * A compact language chip (e.g. "HI") with the full language name on hover.
 * Renders nothing when no code is given, so it can be dropped in unconditionally.
 */
export function LanguageBadge({ code, title }: { code?: string; title?: string }) {
  const name = languageName(code);
  if (!code || !name) return null;
  return (
    <span
      title={title ?? `Language: ${name}`}
      className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted"
    >
      {code.toLowerCase()}
    </span>
  );
}
