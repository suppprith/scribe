import { q } from "../client";

export interface GuildConfigRow {
  guild_id: string;
  watched_vc_ids: string; // JSON array of channel ids
  summary_channel_id: string | null;
  updated_at: number;
}

/** Decoded guild configuration with the JSON column parsed. */
export interface GuildConfig {
  guildId: string;
  watchedVcIds: string[];
  summaryChannelId: string | null;
  updatedAt: number;
}

function decode(row: GuildConfigRow): GuildConfig {
  return {
    guildId: row.guild_id,
    watchedVcIds: JSON.parse(row.watched_vc_ids) as string[],
    summaryChannelId: row.summary_channel_id,
    updatedAt: row.updated_at,
  };
}

export const guildConfig = {
  get(guildId: string): GuildConfig | null {
    const row = q<GuildConfigRow>(`SELECT * FROM guild_config WHERE guild_id = ?`).get(guildId);
    return row ? decode(row) : null;
  },

  /** Insert or update a guild's watched channels + summary channel. */
  upsert(input: {
    guildId: string;
    watchedVcIds: string[];
    summaryChannelId?: string | null;
  }): GuildConfig {
    const row = q<GuildConfigRow>(
      `INSERT INTO guild_config (guild_id, watched_vc_ids, summary_channel_id, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id) DO UPDATE SET
         watched_vc_ids = excluded.watched_vc_ids,
         summary_channel_id = excluded.summary_channel_id,
         updated_at = excluded.updated_at
       RETURNING *`,
    ).get(
      input.guildId,
      JSON.stringify(input.watchedVcIds),
      input.summaryChannelId ?? null,
      Date.now(),
    )!;
    return decode(row);
  },

  all(): GuildConfig[] {
    return q<GuildConfigRow>(`SELECT * FROM guild_config`).all().map(decode);
  },
};
