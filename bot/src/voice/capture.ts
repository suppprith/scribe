import { EndBehaviorType } from "@discordjs/voice";
import prism from "prism-media";
import { createLogger } from "../log";
import { pcm48StereoToPcm16Mono } from "./resample";

const log = createLogger("scribe.voice");

/** One speaker's utterance, decoded to 16 kHz mono PCM and attributed. */
export interface CapturedSegment {
  userId: string;
  username: string;
  /** 16 kHz mono signed-16-bit-LE PCM. */
  pcm: Buffer;
  /** Epoch ms when the speaker started this utterance. */
  startedAt: number;
  /** Epoch ms when silence ended it. */
  endedAt: number;
}

/** The slice of a readable stream the capture pipeline relies on. */
export interface PcmStream {
  on(event: "data", listener: (chunk: Buffer) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  pipe<T extends NodeJS.WritableStream>(destination: T): T;
}

/** The slice of `connection.receiver` the capture pipeline relies on. */
export interface CaptureReceiver {
  speaking: { on(event: "start", listener: (userId: string) => void): unknown };
  subscribe(
    userId: string,
    options: { end: { behavior: EndBehaviorType; duration: number } },
  ): PcmStream;
}

type Decoder = NodeJS.ReadWriteStream;

export interface SessionCaptureOptions {
  receiver: CaptureReceiver;
  /** Resolve a Discord user id to a display name for attribution. */
  resolveUsername: (userId: string) => string;
  /** Called once per completed utterance, per speaker. */
  onSegment: (segment: CapturedSegment) => void;
  /** Silence (ms) that ends an utterance. Default 800. */
  silenceMs?: number;
  now?: () => number;
  /** Opus→PCM(48k stereo) decoder factory. Injected in tests. */
  createDecoder?: () => Decoder;
}

const defaultCreateDecoder = (): Decoder =>
  new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 });

/**
 * Subscribes to each speaker independently and turns their Opus voice into
 * attributed 16 kHz mono PCM segments. One subscription per active utterance per
 * user, so overlapping speakers are captured as independent streams. New
 * speaking after silence starts a fresh segment.
 */
export class SessionCapture {
  private readonly receiver: CaptureReceiver;
  private readonly resolveUsername: (userId: string) => string;
  private readonly onSegment: (segment: CapturedSegment) => void;
  private readonly silenceMs: number;
  private readonly now: () => number;
  private readonly createDecoder: () => Decoder;

  /** Users with an in-flight utterance subscription. */
  private readonly capturing = new Set<string>();
  private started = false;
  private stopped = false;

  constructor(options: SessionCaptureOptions) {
    this.receiver = options.receiver;
    this.resolveUsername = options.resolveUsername;
    this.onSegment = options.onSegment;
    this.silenceMs = options.silenceMs ?? 800;
    this.now = options.now ?? Date.now;
    this.createDecoder = options.createDecoder ?? defaultCreateDecoder;
  }

  /** Begin reacting to speakers. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.receiver.speaking.on("start", (userId: string) => this.captureUser(userId));
  }

  /** Stop opening new utterance captures. In-flight ones finish on their own. */
  stop(): void {
    this.stopped = true;
  }

  /** Number of speakers currently being captured. */
  capturingCount(): number {
    return this.capturing.size;
  }

  private captureUser(userId: string): void {
    if (this.stopped || this.capturing.has(userId)) return;
    this.capturing.add(userId);

    const username = this.resolveUsername(userId);
    const startedAt = this.now();

    const opus = this.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: this.silenceMs },
    });
    const decoded = opus.pipe(this.createDecoder());

    const chunks: Buffer[] = [];
    decoded.on("data", (chunk: Buffer) => chunks.push(chunk));
    decoded.on("end", () => {
      if (!this.capturing.delete(userId)) return;
      const pcm = pcm48StereoToPcm16Mono(Buffer.concat(chunks));
      if (pcm.length > 0) {
        this.onSegment({ userId, username, pcm, startedAt, endedAt: this.now() });
      }
    });
    decoded.on("error", (err) => {
      // A corrupt Opus stream loses this utterance only — capture continues.
      log.warn(`audio decode failed for ${userId} — utterance dropped: ${err.message}`);
      this.capturing.delete(userId);
    });
  }
}
