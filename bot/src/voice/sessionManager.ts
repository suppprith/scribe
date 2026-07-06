import { randomUUID } from "node:crypto";
import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";
import { participants, sessions } from "../db";
import { createLogger } from "../log";

const log = createLogger("scribe.voice");

/** The minimal surface of a voice connection the manager needs. */
export interface VoiceConnectionLike {
  destroy(): void;
}

/** Abstracts joining a voice channel so the manager is testable without Discord. */
export interface VoiceGateway {
  join(params: {
    sessionId: string;
    guildId: string;
    channelId: string;
    adapterCreator: DiscordGatewayAdapterCreator;
  }): VoiceConnectionLike;
}

export type TimerHandle = unknown;

/** Abstracts timers so the grace period can be tested deterministically. */
export interface Scheduler {
  set(fn: () => void, ms: number): TimerHandle;
  clear(handle: TimerHandle): void;
}

const defaultScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface SessionEndInfo {
  sessionId: string;
  guildId: string;
  channelId: string;
}

export interface SessionManagerOptions {
  gateway: VoiceGateway;
  /** Grace period before ending an emptied session, in ms. Default 30000. */
  graceMs?: number;
  scheduler?: Scheduler;
  /** Fired after a session ends — the hook for the transcript → summary →
   *  storage pipeline (later phases). */
  onSessionEnd?: (info: SessionEndInfo) => void;
  now?: () => number;
}

interface ActiveSession {
  sessionId: string;
  guildId: string;
  channelId: string;
  connection: VoiceConnectionLike;
  /** Currently-present non-bot user ids. */
  present: Set<string>;
  endTimer?: TimerHandle;
}

function keyOf(guildId: string, channelId: string): string {
  return `${guildId}:${channelId}`;
}

/**
 * Owns the lifecycle of recording sessions across guilds and channels. Keyed by
 * guild+channel so multiple servers/channels record concurrently with isolated
 * state. A session opens when the first non-bot user enters a watched channel
 * and ends once the channel has been empty of real users for the grace period.
 */
export class SessionManager {
  private readonly active = new Map<string, ActiveSession>();
  private readonly gateway: VoiceGateway;
  private readonly graceMs: number;
  private readonly scheduler: Scheduler;
  private readonly onSessionEnd?: (info: SessionEndInfo) => void;
  private readonly now: () => number;

  constructor(options: SessionManagerOptions) {
    this.gateway = options.gateway;
    this.graceMs = options.graceMs ?? 30_000;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.onSessionEnd = options.onSessionEnd;
    this.now = options.now ?? Date.now;
  }

  /** Whether a session is currently recording this channel. */
  isActive(guildId: string, channelId: string): boolean {
    return this.active.has(keyOf(guildId, channelId));
  }

  /** Number of sessions recording right now. */
  activeCount(): number {
    return this.active.size;
  }

  /**
   * A non-bot user joined a watched voice channel. Opens the session (and joins
   * voice) if it is the first participant; otherwise just registers them. Safe
   * to call repeatedly for the same user — never double-joins a channel.
   */
  userJoined(params: {
    guildId: string;
    channelId: string;
    userId: string;
    username: string;
    adapterCreator: DiscordGatewayAdapterCreator;
  }): void {
    const key = keyOf(params.guildId, params.channelId);
    let session = this.active.get(key);

    if (!session) {
      const sessionId = randomUUID();
      sessions.create({
        id: sessionId,
        guildId: params.guildId,
        channelId: params.channelId,
        startedAt: this.now(),
      });
      const connection = this.gateway.join({
        sessionId,
        guildId: params.guildId,
        channelId: params.channelId,
        adapterCreator: params.adapterCreator,
      });
      session = {
        sessionId,
        guildId: params.guildId,
        channelId: params.channelId,
        connection,
        present: new Set(),
      };
      this.active.set(key, session);
      log.info(`session ${sessionId} started in ${key}`);
    }

    // A returning participant cancels any pending end.
    if (session.endTimer !== undefined) {
      this.scheduler.clear(session.endTimer);
      session.endTimer = undefined;
    }

    session.present.add(params.userId);
    participants.join({
      sessionId: session.sessionId,
      userId: params.userId,
      username: params.username,
      joinedAt: this.now(),
    });
  }

  /**
   * A user left a channel. If a session is recording it, record the leave; when
   * the last real user is gone, schedule the session to end after the grace
   * period. A quick rejoin cancels that.
   */
  userLeft(params: { guildId: string; channelId: string; userId: string }): void {
    const key = keyOf(params.guildId, params.channelId);
    const session = this.active.get(key);
    if (!session || !session.present.has(params.userId)) return;

    session.present.delete(params.userId);
    participants.leave(session.sessionId, params.userId, this.now());

    if (session.present.size === 0 && session.endTimer === undefined) {
      session.endTimer = this.scheduler.set(() => this.endSession(key), this.graceMs);
    }
  }

  /** End every active session immediately — for graceful shutdown. */
  endAll(): void {
    for (const [key, session] of [...this.active.entries()]) {
      log.info(`session ${session.sessionId} ended in ${key} (shutdown)`);
      this.teardown(key, session);
    }
  }

  private endSession(key: string): void {
    const session = this.active.get(key);
    if (!session) return;
    // A rejoin during grace clears the timer; guard against a late fire anyway.
    if (session.present.size > 0) {
      session.endTimer = undefined;
      return;
    }
    log.info(`session ${session.sessionId} ended in ${key}`);
    this.teardown(key, session);
  }

  /** Persist the end, tear down the connection, and fire the pipeline hook. */
  private teardown(key: string, session: ActiveSession): void {
    if (session.endTimer !== undefined) {
      this.scheduler.clear(session.endTimer);
      session.endTimer = undefined;
    }
    sessions.end(session.sessionId, this.now());
    // Stop capture is implicit in destroy(); hand off to the end-of-session
    // pipeline (transcript → summary → storage) once those phases land.
    session.connection.destroy();
    this.active.delete(key);
    this.onSessionEnd?.({
      sessionId: session.sessionId,
      guildId: session.guildId,
      channelId: session.channelId,
    });
  }
}
