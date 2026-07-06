import { q } from "../client";

export interface SummaryRow {
  session_id: string;
  structured_json: string; // JSON: structured summary (shape settles in Phase 5)
  posted_to_discord: number;
}

/** Decoded summary. `structured` is typed by the caller (`T`). */
export interface Summary<T = unknown> {
  sessionId: string;
  structured: T;
  postedToDiscord: boolean;
}

function decode<T>(row: SummaryRow): Summary<T> {
  return {
    sessionId: row.session_id,
    structured: JSON.parse(row.structured_json) as T,
    postedToDiscord: row.posted_to_discord === 1,
  };
}

export const summaries = {
  upsert<T>(input: { sessionId: string; structured: T }): Summary<T> {
    const row = q<SummaryRow>(
      `INSERT INTO summaries (session_id, structured_json, posted_to_discord)
       VALUES (?, ?, 0)
       ON CONFLICT (session_id) DO UPDATE SET
         structured_json = excluded.structured_json
       RETURNING *`,
    ).get(input.sessionId, JSON.stringify(input.structured))!;
    return decode<T>(row);
  },

  markPosted(sessionId: string): void {
    q(`UPDATE summaries SET posted_to_discord = 1 WHERE session_id = ?`).run(sessionId);
  },

  get<T = unknown>(sessionId: string): Summary<T> | null {
    const row = q<SummaryRow>(`SELECT * FROM summaries WHERE session_id = ?`).get(sessionId);
    return row ? decode<T>(row) : null;
  },
};
