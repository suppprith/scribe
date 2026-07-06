/**
 * Deterministic per-speaker colors so a given user looks the same everywhere
 * (live captions, transcript, search). A fixed palette keyed by a hash of the
 * user id keeps contrast readable on the dark surface.
 */
const PALETTE = [
  "#6d8bff", // blue
  "#3ecf8e", // green
  "#f0b429", // amber
  "#f2555a", // red
  "#c084fc", // purple
  "#22d3ee", // cyan
  "#fb7185", // pink
  "#a3e635", // lime
];

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A stable hex color for a speaker, keyed by their Discord user id. */
export function speakerColor(userId: string): string {
  return PALETTE[hash(userId) % PALETTE.length]!;
}

/** Initials for an avatar chip, e.g. "Ada Lovelace" → "AL". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
