/** Small, dependency-free formatters shared across the dashboard. */

/** Epoch ms → e.g. "Jul 5, 2026, 2:15 PM". */
export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** A duration in ms → "1h 04m", "12m 30s", or "45s". */
export function formatDuration(ms?: number): string {
  if (ms == null) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** Epoch ms → local wall-clock "2:15:07 PM" — for live captions arriving now. */
export function formatWallClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { timeStyle: "medium" });
}

/** An offset-from-start in ms → "mm:ss" (or "h:mm:ss" past an hour). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
