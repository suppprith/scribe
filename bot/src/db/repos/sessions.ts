import type { SessionStatus } from "@scribe/shared";
import { q } from "../client";

export interface SessionRow {
  id: string;
  guild_id: string;
  channel_id: string;
  status: SessionStatus;
  started_at: number;
  ended_at: number | null;
}

export const sessions = {
  create(input: {
    id: string;
    guildId: string;
    channelId: string;
    startedAt?: number;
  }): SessionRow {
    return q<SessionRow>(
      `INSERT INTO sessions (id, guild_id, channel_id, status, started_at)
       VALUES (?, ?, ?, 'active', ?)
       RETURNING *`,
    ).get(input.id, input.guildId, input.channelId, input.startedAt ?? Date.now())!;
  },

  get(id: string): SessionRow | null {
    return q<SessionRow>(`SELECT * FROM sessions WHERE id = ?`).get(id);
  },

  end(id: string, endedAt: number = Date.now()): void {
    q(`UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?`).run(endedAt, id);
  },

  listByGuild(guildId: string): SessionRow[] {
    return q<SessionRow>(
      `SELECT * FROM sessions WHERE guild_id = ? ORDER BY started_at DESC`,
    ).all(guildId);
  },

  listActive(): SessionRow[] {
    return q<SessionRow>(`SELECT * FROM sessions WHERE status = 'active'`).all();
  },
};
