import { createLogger } from "../log";
import type { CapturedSegmentWithSession } from "../voice";
import { encodeWav } from "./wav";

const log = createLogger("scribe.audio");

/** 16 kHz mono signed-16-bit PCM: 16 samples/ms, 32 bytes/ms. */
const SAMPLES_PER_MS = 16;
const BYTES_PER_MS = 32;

/**
 * Cap on buffered audio per session, in bytes. 16 kHz mono = 32 KB/s, so this is
 * ~45 minutes. Beyond it we stop retaining audio for that session (captions and
 * the summary are unaffected) to protect the host's memory on long meetings.
 */
const DEFAULT_MAX_BYTES = 45 * 60 * BYTES_PER_MS * 1000;

interface BufferedSegment {
  /** Sample offset from the session's first utterance. */
  offsetSamples: number;
  pcm: Buffer;
}

interface SessionBuffer {
  t0: number | null;
  segments: BufferedSegment[];
  bytes: number;
  capped: boolean;
}

/**
 * Accumulates each session's per-speaker utterances and, on finalize, mixes them
 * into one time-accurate 16 kHz mono WAV — the meeting's archived recording.
 *
 * Speakers overlap, so we place every utterance at its real offset from the
 * session's first sound and sum the samples (clamped), rather than concatenating.
 * Buffering is in memory and bounded by a per-session byte cap.
 */
export class SessionRecorder {
  private readonly sessions = new Map<string, SessionBuffer>();
  private readonly maxBytes: number;

  constructor(options: { maxBytes?: number } = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  /** Retain one captured utterance for its session's recording. */
  add(segment: CapturedSegmentWithSession): void {
    if (segment.pcm.length === 0) return;

    let buf = this.sessions.get(segment.sessionId);
    if (!buf) {
      buf = { t0: null, segments: [], bytes: 0, capped: false };
      this.sessions.set(segment.sessionId, buf);
    }

    if (buf.t0 === null) buf.t0 = segment.startedAt;
    if (buf.bytes + segment.pcm.length > this.maxBytes) {
      if (!buf.capped) {
        buf.capped = true;
        log.warn(
          `session ${segment.sessionId} exceeded the audio recording cap — ` +
            `remaining audio won't be saved (transcript/summary unaffected)`,
        );
      }
      return;
    }

    const offsetMs = Math.max(0, segment.startedAt - buf.t0);
    buf.segments.push({ offsetSamples: offsetMs * SAMPLES_PER_MS, pcm: segment.pcm });
    buf.bytes += segment.pcm.length;
  }

  /**
   * Mix and return the session's recording as WAV bytes, then free the buffer.
   * Returns null if the session had no audio. Safe to call once per session;
   * a second call returns null.
   */
  finalize(sessionId: string): Buffer | null {
    const buf = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (!buf || buf.segments.length === 0) return null;

    let totalSamples = 0;
    for (const seg of buf.segments) {
      totalSamples = Math.max(totalSamples, seg.offsetSamples + seg.pcm.length / 2);
    }
    if (totalSamples === 0) return null;

    const mix = new Int16Array(totalSamples);
    for (const seg of buf.segments) {
      const count = seg.pcm.length / 2;
      for (let i = 0; i < count; i++) {
        const at = seg.offsetSamples + i;
        const sum = mix[at]! + seg.pcm.readInt16LE(i * 2);
        // Clamp to the signed-16-bit range so overlapping speakers don't wrap.
        mix[at] = sum > 32767 ? 32767 : sum < -32768 ? -32768 : sum;
      }
    }

    return encodeWav(Buffer.from(mix.buffer, mix.byteOffset, mix.byteLength));
  }

  /** Drop a session's buffered audio without producing a file. */
  discard(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
