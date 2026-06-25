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
 */
export function assembleTranscript(sessionId: string): AssembledTranscript {
  const finals = captions.listFinal(sessionId); // ordered by ts_start, id

  const utterances = finals.map((c) => ({ speaker: c.username, text: c.text }));
  const fullText = finals.map((c) => `${c.username}: ${c.text}`).join("\n");

  const perUser: Record<string, string> = {};
  for (const c of finals) {
    perUser[c.user_id] = perUser[c.user_id] ? `${perUser[c.user_id]} ${c.text}` : c.text;
  }

  const names = participants.listBySession(sessionId).map((p) => p.username);

  transcripts.upsert({ sessionId, fullText, perUser });

  return { sessionId, fullText, perUser, participants: names, utterances };
}
