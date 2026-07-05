/**
 * Display helpers for language codes (ISO 639-1) surfaced by the bot — a
 * participant's configured spoken language and a caption's detected language.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  th: "Thai",
};

/** Full language name for a code, or the upper-cased code as a fallback. */
export function languageName(code?: string): string | undefined {
  if (!code) return undefined;
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

/** Whether a code is a non-English language we can translate to English. */
export function isTranslatable(code?: string): boolean {
  const c = code?.toLowerCase();
  return c === "hi" || c === "th";
}
