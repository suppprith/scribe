import { q } from "../client";

export interface TranscriptRow {
  session_id: string;
  full_text: string;
  per_user_json: string; // JSON: { [userId]: text }
}

/** Decoded transcript with the per-user JSON column parsed. */
export interface Transcript {
  sessionId: string;
  fullText: string;
  perUser: Record<string, string>;
}

function decode(row: TranscriptRow): Transcript {
  return {
    sessionId: row.session_id,
    fullText: row.full_text,
    perUser: JSON.parse(row.per_user_json) as Record<string, string>,
  };
}

export const transcripts = {
  upsert(input: {
    sessionId: string;
    fullText: string;
    perUser?: Record<string, string>;
  }): Transcript {
    const row = q<TranscriptRow>(
      `INSERT INTO transcripts (session_id, full_text, per_user_json)
       VALUES (?, ?, ?)
       ON CONFLICT (session_id) DO UPDATE SET
         full_text = excluded.full_text,
         per_user_json = excluded.per_user_json
       RETURNING *`,
    ).get(input.sessionId, input.fullText, JSON.stringify(input.perUser ?? {}))!;
    return decode(row);
  },

  get(sessionId: string): Transcript | null {
    const row = q<TranscriptRow>(`SELECT * FROM transcripts WHERE session_id = ?`).get(sessionId);
    return row ? decode(row) : null;
  },
};
