/**
 * A live caption for one chunk of one speaker.
 *
 * Partials (`isFinal: false`) are a fast, possibly-rough first pass shown
 * immediately on the client and replaced in place by the corrected
 * `isFinal: true` version. Only finals are persisted, so a full transcript can
 * be rebuilt from stored finals alone.
 */
export interface Caption {
  sessionId: string;
  /** Discord user id of the speaker. */
  userId: string;
  /** Display name of the speaker. */
  username: string;
  /** Transcribed (and, where applicable, translated) text. */
  text: string;
  /** Offset from session start, in milliseconds. */
  tsStart: number;
  tsEnd: number;
  /** Final (persisted) vs partial (display-only). */
  isFinal: boolean;
  /** Per-speaker monotonic sequence number (from chunking) for ordering/dedup. */
  seq: number;
  /** Detected source language as an ISO 639-1 code, if known (e.g. "en", "hi"). */
  lang?: string;
  /** English translation of `text`, present only when `lang` is non-English. */
  translatedText?: string;
  /** Target language of `translatedText` (currently always "en"). */
  translatedTo?: string;
}
