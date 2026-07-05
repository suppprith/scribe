import { captions, participants, transcripts } from "../db";

export interface AssembledTranscript {
  sessionId: string;
  /** Merged transcript: one "Speaker: text" line per final caption, time-ordered. */
  fullText: string;
  /** Per-speaker text, keyed by Discord user id. */
  perUser: Record<string, string>;
  /** Participant display names, in join order. */
  participants: string[];
  /** Time-ordered utterances, the shape the /summarize endpoint consumes. */
  utterances: { speaker: string; text: string }[];
}

/**
 * Build a complete, time-ordered transcript from a session's stored final
 * captions and persist it (merged + per-speaker). Idempotent — safe to call
 * more than once for a session. Returns the assembled data for summarization.
 *
 * Uses the English translation of each turn when present (falling back to the
 * original), so the summary of a mixed-language meeting is coherent English.
 * The captions table keeps both languages per turn for the transcript view.
 */
export function assembleTranscript(sessionId: string): AssembledTranscript {
  const finals = captions.listFinal(sessionId); // ordered by ts_start, id
  const englishOf = (c: (typeof finals)[number]): string => c.translated_text ?? c.text;

  const utterances = finals.map((c) => ({ speaker: c.username, text: englishOf(c) }));
  const fullText = finals.map((c) => `${c.username}: ${englishOf(c)}`).join("\n");

  const perUser: Record<string, string> = {};
  for (const c of finals) {
    const line = englishOf(c);
    perUser[c.user_id] = perUser[c.user_id] ? `${perUser[c.user_id]} ${line}` : line;
  }

  const names = participants.listBySession(sessionId).map((p) => p.username);

  transcripts.upsert({ sessionId, fullText, perUser });

  return { sessionId, fullText, perUser, participants: names, utterances };
}

/**
 * Best-effort: translate any non-English final captions that don't yet have an
 * English translation and persist it. Covers turns the live path missed (NLP
 * briefly unavailable) and pre-Phase-7 captions, so the summary — built from the
 * English text — stays coherent for mixed-language meetings. Failures are left
 * untranslated rather than blocking the summary.
 */
export async function backfillTranslations(
  sessionId: string,
  translate: (text: string, srcLang: string) => Promise<{ text: string; to: string } | null>,
): Promise<void> {
  for (const c of captions.listFinal(sessionId)) {
    if (c.translated_text || !c.lang || c.lang === "en") continue;
    const t = await translate(c.text, c.lang);
    if (t && t.text && t.text !== c.text) {
      captions.setTranslation(c.id, t.text, t.to);
    }
  }
}
