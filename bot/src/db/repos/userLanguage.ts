import { q } from "../client";

/**
 * A user's declared spoken language. `auto` lets Whisper detect per chunk; the
 * ISO 639-1 codes force that language (needed for Hindi/Thai, which the English
 * `.en` models can't transcribe). Kept in sync with the `/scribe lang` choices.
 */
export type SpokenLanguage = "auto" | "en" | "hi" | "th";

export const SPOKEN_LANGUAGES: SpokenLanguage[] = ["auto", "en", "hi", "th"];

export function isSpokenLanguage(value: string): value is SpokenLanguage {
  return (SPOKEN_LANGUAGES as string[]).includes(value);
}

export interface UserLanguageRow {
  guild_id: string;
  user_id: string;
  language: string; // ISO 639-1 code or 'auto'
  updated_at: number;
}

export const userLanguage = {
  /** The configured language for a user in a guild; `auto` when unset. */
  get(guildId: string, userId: string): SpokenLanguage {
    const row = q<UserLanguageRow>(
      `SELECT * FROM user_language WHERE guild_id = ? AND user_id = ?`,
    ).get(guildId, userId);
    const value = row?.language;
    return value && isSpokenLanguage(value) ? value : "auto";
  },

  /** Set (or update) a user's language for a guild. */
  set(guildId: string, userId: string, language: SpokenLanguage): void {
    q(
      `INSERT INTO user_language (guild_id, user_id, language, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         language = excluded.language,
         updated_at = excluded.updated_at`,
    ).run(guildId, userId, language, Date.now());
  },

  /** Every configured language in a guild, keyed by user id (for enrichment). */
  mapByGuild(guildId: string): Record<string, SpokenLanguage> {
    const rows = q<UserLanguageRow>(
      `SELECT * FROM user_language WHERE guild_id = ?`,
    ).all(guildId);
    const out: Record<string, SpokenLanguage> = {};
    for (const r of rows) {
      if (isSpokenLanguage(r.language)) out[r.user_id] = r.language;
    }
    return out;
  },
};
