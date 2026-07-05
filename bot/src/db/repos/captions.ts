import { q } from "../client";

export interface CaptionRow {
  id: number;
  session_id: string;
  user_id: string;
  username: string;
  text: string;
  ts_start: number; // ms from session start
  ts_end: number;
  is_final: number; // 0 partial, 1 final
  lang: string | null; // detected source language (ISO 639-1)
  translated_text: string | null; // English translation of non-English turns
  translated_to: string | null; // target language of translated_text
}

export const captions = {
  insert(input: {
    sessionId: string;
    userId: string;
    username: string;
    text: string;
    tsStart: number;
    tsEnd: number;
    isFinal?: boolean;
    lang?: string;
    translatedText?: string;
    translatedTo?: string;
  }): CaptionRow {
    return q<CaptionRow>(
      `INSERT INTO captions
         (session_id, user_id, username, text, ts_start, ts_end, is_final, lang, translated_text, translated_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    ).get(
      input.sessionId,
      input.userId,
      input.username,
      input.text,
      input.tsStart,
      input.tsEnd,
      input.isFinal ? 1 : 0,
      input.lang ?? null,
      input.translatedText ?? null,
      input.translatedTo ?? null,
    )!;
  },

  /** Attach (or replace) the English translation of a stored caption. */
  setTranslation(id: number, translatedText: string, translatedTo: string): void {
    q(`UPDATE captions SET translated_text = ?, translated_to = ? WHERE id = ?`).run(
      translatedText,
      translatedTo,
      id,
    );
  },

  listBySession(sessionId: string): CaptionRow[] {
    return q<CaptionRow>(
      `SELECT * FROM captions WHERE session_id = ? ORDER BY ts_start, id`,
    ).all(sessionId);
  },

  listFinal(sessionId: string): CaptionRow[] {
    return q<CaptionRow>(
      `SELECT * FROM captions WHERE session_id = ? AND is_final = 1 ORDER BY ts_start, id`,
    ).all(sessionId);
  },
};
