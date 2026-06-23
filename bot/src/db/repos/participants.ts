import { q } from "../client";

export interface ParticipantRow {
  session_id: string;
  user_id: string;
  username: string;
  joined_at: number;
  left_at: number | null;
}

export const participants = {
  /** Record a join. Idempotent per (session, user); refreshes the username and
   *  clears any prior leave (a rejoin). */
  join(input: {
    sessionId: string;
    userId: string;
    username: string;
    joinedAt?: number;
  }): ParticipantRow {
    return q<ParticipantRow>(
      `INSERT INTO participants (session_id, user_id, username, joined_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (session_id, user_id) DO UPDATE SET
         username = excluded.username,
         left_at = NULL
       RETURNING *`,
    ).get(input.sessionId, input.userId, input.username, input.joinedAt ?? Date.now())!;
  },

  leave(sessionId: string, userId: string, leftAt: number = Date.now()): void {
    q(`UPDATE participants SET left_at = ? WHERE session_id = ? AND user_id = ?`).run(
      leftAt,
      sessionId,
      userId,
    );
  },

  listBySession(sessionId: string): ParticipantRow[] {
    return q<ParticipantRow>(
      `SELECT * FROM participants WHERE session_id = ? ORDER BY joined_at`,
    ).all(sessionId);
  },
};
