import type {
  DriveLink,
  Participant,
  SessionDetail,
  SessionListItem,
  SessionTranscript,
  TranscriptLine,
} from "@scribe/shared";
import {
  captions,
  driveLinks,
  participants,
  summaries,
  userLanguage,
  type ParticipantRow,
  type SessionRow,
  type SpokenLanguage,
} from "../db";

/** SQLite participant row → shared Participant DTO. `lang` is the participant's
 *  configured spoken language, surfaced only when explicitly set (not `auto`). */
export function toParticipant(row: ParticipantRow, lang?: SpokenLanguage): Participant {
  return {
    id: row.user_id,
    name: row.username,
    joinedAt: row.joined_at,
    leftAt: row.left_at ?? undefined,
    lang: lang && lang !== "auto" ? lang : undefined,
  };
}

/** Session row → history list item (participants + duration + summary flag). */
export function toSessionListItem(row: SessionRow): SessionListItem {
  const langByUser = userLanguage.mapByGuild(row.guild_id);
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    durationMs: row.ended_at != null ? row.ended_at - row.started_at : undefined,
    participants: participants
      .listBySession(row.id)
      .map((p) => toParticipant(p, langByUser[p.user_id])),
    hasSummary: summaries.get(row.id) != null,
  };
}

/** Assemble a session's transcript from its stored final captions. */
export function toSessionTranscript(sessionId: string): SessionTranscript {
  const finals = captions.listFinal(sessionId);
  const lines: TranscriptLine[] = finals.map((c) => ({
    userId: c.user_id,
    username: c.username,
    text: c.text,
    tsStart: c.ts_start,
    tsEnd: c.ts_end,
  }));

  const perUser: Record<string, string> = {};
  for (const c of finals) {
    perUser[c.user_id] = perUser[c.user_id] ? `${perUser[c.user_id]} ${c.text}` : c.text;
  }

  return {
    sessionId,
    fullText: finals.map((c) => `${c.username}: ${c.text}`).join("\n"),
    perUser,
    lines,
  };
}

export function toDriveLinks(sessionId: string): DriveLink[] {
  return driveLinks.listBySession(sessionId).map((l) => ({ kind: l.kind, url: l.url }));
}

/** Full session detail: list item + transcript + storage links. */
export function toSessionDetail(row: SessionRow): SessionDetail {
  return {
    ...toSessionListItem(row),
    transcript: toSessionTranscript(row.id),
    driveLinks: toDriveLinks(row.id),
  };
}
