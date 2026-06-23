/** A recording session opened when the bot joins a watched voice channel. */
export type SessionStatus = "active" | "ended";

/** A participant captured during a session (one audio track per participant). */
export interface Participant {
  /** Discord user id. */
  id: string;
  /** Display name captured at join time. */
  name: string;
  /** Epoch ms when the participant joined the channel. */
  joinedAt: number;
  /** Epoch ms when the participant left, if they have. */
  leftAt?: number;
}

export interface Session {
  /** Stable session id (also the SQLite primary key). */
  id: string;
  guildId: string;
  channelId: string;
  status: SessionStatus;
  /** Epoch ms when the session opened (bot joined). */
  startedAt: number;
  /** Epoch ms when the session closed (last participant left). */
  endedAt?: number;
  participants: Participant[];
}
