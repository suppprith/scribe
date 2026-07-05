/**
 * DTOs for the bot's HTTP API (the read side that serves the web client from
 * SQLite). Kept here so the bot's handlers and the client's typed fetchers
 * share one contract. Types only — no runtime code.
 */
import type { Participant, SessionStatus } from "./session";

/** A row in the sessions history list. */
export interface SessionListItem {
  id: string;
  guildId: string;
  channelId: string;
  status: SessionStatus;
  /** Epoch ms when the session opened. */
  startedAt: number;
  /** Epoch ms when it closed, if it has. */
  endedAt?: number;
  /** Wall-clock length; absent while still active. */
  durationMs?: number;
  participants: Participant[];
  /** Whether a generated summary exists for this session. */
  hasSummary: boolean;
}

/** One attributed, time-ordered line of a transcript (a stored final caption). */
export interface TranscriptLine {
  userId: string;
  username: string;
  text: string;
  /** Offset from session start, in ms. */
  tsStart: number;
  tsEnd: number;
}

export interface SessionTranscript {
  sessionId: string;
  /** Merged "Speaker: text" transcript, newline-separated. */
  fullText: string;
  /** Per-speaker joined text, keyed by Discord user id. */
  perUser: Record<string, string>;
  /** Attributed lines, in order — powers the per-speaker toggle and search jumps. */
  lines: TranscriptLine[];
}

export type DriveLinkKind = "audio" | "transcript" | "summary";

export interface DriveLink {
  kind: DriveLinkKind;
  url: string;
}

/** Full session view: metadata + transcript + storage links. */
export interface SessionDetail extends SessionListItem {
  transcript: SessionTranscript;
  driveLinks: DriveLink[];
}

/**
 * Structured meeting summary, mirroring the NLP service's /summarize result.
 * This is the contract the web summary page renders and the Discord embed uses.
 */
export interface MeetingSummary {
  overview: string;
  topics: string[];
  keywords: string[];
  decisions: string[];
  action_items: string[];
  highlights: string[];
  prose: string;
}

/** Keyword (TF-IDF) vs semantic (Word2Vec query-expansion) transcript search. */
export type SearchMode = "keyword" | "semantic";

export interface SearchHit {
  /** Index into the session's transcript `lines` — used to jump to the match. */
  lineIndex: number;
  userId: string;
  username: string;
  text: string;
  tsStart: number;
  /** Relevance score from the IR ranker (higher is better). */
  score: number;
}

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  /** Query terms actually searched (for semantic mode, includes expansions). */
  terms: string[];
  hits: SearchHit[];
}
