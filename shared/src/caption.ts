/**
 * A live caption is "partial" while it is still being revised and "final" once
 * the speaker's utterance has settled. The client replaces partials in place and
 * keeps finals.
 */
export type CaptionKind = "partial" | "final";

export interface Caption {
  sessionId: string;
  /** Discord user id of the speaker. */
  speakerId: string;
  /** Human-readable speaker label (Discord display name). */
  speaker: string;
  kind: CaptionKind;
  /** Transcribed (and, where applicable, translated) text. */
  text: string;
  /** Detected source language as an ISO 639-1 code, if known (e.g. "en", "hi"). */
  lang?: string;
  /** Offset from session start, in milliseconds. */
  offsetMs: number;
  /** Epoch ms when the caption was produced. */
  at: number;
}
