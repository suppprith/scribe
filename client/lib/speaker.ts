/**
 * Deterministic per-speaker colors so a given user looks the same everywhere
 * (live captions, transcript, search). A fixed palette keyed by a hash of the
 * user id keeps contrast readable on the dark surface.
 */
const PALETTE = [
  "#ff8a5c", // coral (brand)
  "#37d399", // emerald
  "#f2b34b", // amber
  "#7aa2ff", // periwinkle
  "#c88bfc", // orchid
  "#3ec8d8", // teal
  "#fb7185", // rose
  "#b6d95c", // olive-lime
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
