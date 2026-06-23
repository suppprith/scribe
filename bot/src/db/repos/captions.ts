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
  }): CaptionRow {
    return q<CaptionRow>(
      `INSERT INTO captions (session_id, user_id, username, text, ts_start, ts_end, is_final)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    ).get(
      input.sessionId,
      input.userId,
      input.username,
      input.text,
      input.tsStart,
      input.tsEnd,
      input.isFinal ? 1 : 0,
    )!;
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
