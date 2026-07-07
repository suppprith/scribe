import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { open, rm, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../log";
import type { CapturedSegmentWithSession } from "../voice";
import { encodePcmToOggOpus } from "./opus";

const log = createLogger("scribe.audio");

/** 16 kHz mono signed-16-bit PCM: 16 samples/ms, 32 bytes/ms. */
const SAMPLES_PER_MS = 16;
const BYTES_PER_MS = 32;

/**
 * Safety cap on a single session's recording, in bytes of raw PCM. The mix is
 * streamed to a temp file, so this bounds *disk*, not memory: ~6 hours at 32
 * KB/s. Past it we stop retaining audio for that session (captions and the
 * summary are unaffected) so a forgotten open channel can't fill the disk.
 */
const DEFAULT_MAX_BYTES = 6 * 60 * 60 * BYTES_PER_MS * 1000;

const clamp16 = (n: number): number => (n > 32767 ? 32767 : n < -32768 ? -32768 : n);

/** The finished recording: an Ogg Opus file on disk the caller must delete. */
export interface Recording {
  /** Absolute path to a temp `.ogg` file. */
  path: string;
  fileName: string;
  mimeType: string;
}

interface SessionBuffer {
  path: string;
  /** Opened lazily by the first queued mix. */
  handle: FileHandle | null;
  t0: number | null;
  /** Highest sample index written so far (file length in samples). */
  writtenSamples: number;
  /** Serializes read-modify-write mixes so overlapping segments don't race. */
  tail: Promise<void>;
  bytes: number;
  capped: boolean;
}

/**
 * Accumulates each session's per-speaker utterances into one time-accurate 16
 * kHz mono recording and, on finalize, encodes it to Ogg Opus for archival.
 *
 * Speakers overlap, so every utterance is placed at its real offset from the
 * session's first sound and its samples summed (clamped) with whatever is
 * already there — the meeting is *mixed*, not concatenated. The mix lives in a
 * temp file rather than memory: each utterance is a bounded read-modify-write at
 * its offset, so a long meeting costs disk, not RAM. Writes for a session are
 * serialized through a promise chain so concurrent utterances can't corrupt the
 * file.
 */
export class SessionRecorder {
  private readonly sessions = new Map<string, SessionBuffer>();
  private readonly maxBytes: number;

  constructor(options: { maxBytes?: number } = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  /** Retain one captured utterance for its session's recording (non-blocking). */
  add(segment: CapturedSegmentWithSession): void {
    if (segment.pcm.length === 0) return;

    let buf = this.sessions.get(segment.sessionId);
    if (!buf) {
      const path = join(tmpdir(), `scribe-rec-${segment.sessionId}-${Date.now()}.pcm`);
      buf = {
        path,
        handle: null,
        t0: null,
        writtenSamples: 0,
        tail: Promise.resolve(),
        bytes: 0,
        capped: false,
      };
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
    buf.bytes += segment.pcm.length;

    // Copy the PCM: the mix runs later off the write chain, after the caller's
    // buffer may have been reused.
    const pcm = Buffer.from(segment.pcm);
    const offsetSamples = Math.max(0, (segment.startedAt - buf.t0) * SAMPLES_PER_MS);
    const target = buf;
    target.tail = target.tail
      .then(() => this.mix(target, pcm, offsetSamples))
      .catch((err) => log.error(`failed to mix audio for ${segment.sessionId}:`, err));
  }

  /** Read-modify-write one utterance into the mix file at its sample offset. */
  private async mix(buf: SessionBuffer, pcm: Buffer, offsetSamples: number): Promise<void> {
    if (!buf.handle) buf.handle = await open(buf.path, "w+");

    const n = pcm.length / 2;
    const startByte = offsetSamples * 2;
    const out = pcm; // already a private copy; safe to mutate in place

    // Sum with any samples already written where this utterance overlaps them.
    const overlap = Math.max(0, Math.min(n, buf.writtenSamples - offsetSamples));
    if (overlap > 0) {
      const existing = Buffer.alloc(overlap * 2);
      await buf.handle.read(existing, 0, existing.length, startByte);
      for (let i = 0; i < overlap; i++) {
        out.writeInt16LE(clamp16(out.readInt16LE(i * 2) + existing.readInt16LE(i * 2)), i * 2);
      }
    }

    // If this utterance starts past the current end, zero-fill the silent gap.
    if (offsetSamples > buf.writtenSamples) await buf.handle.truncate(startByte);

    await buf.handle.write(out, 0, out.length, startByte);
    buf.writtenSamples = Math.max(buf.writtenSamples, offsetSamples + n);
  }

  /**
   * Drain pending mixes, encode the session's recording to Ogg Opus, and return
   * a descriptor for the temp file (which the caller owns and must delete).
   * Returns null if the session had no audio. Frees the session either way.
   * Safe to call once; a second call returns null.
   */
  async finalize(sessionId: string): Promise<Recording | null> {
    const buf = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (!buf) return null;

    await buf.tail;
    if (!buf.handle || buf.writtenSamples === 0) {
      await this.cleanup(buf);
      return null;
    }
    await buf.handle.close();

    const oggPath = `${buf.path}.ogg`;
    try {
      const out = createWriteStream(oggPath);
      await encodePcmToOggOpus(createReadStream(buf.path), out);
      out.end();
      await once(out, "finish");
      return { path: oggPath, fileName: "recording.ogg", mimeType: "audio/ogg" };
    } catch (err) {
      log.error(`failed to encode recording for ${sessionId}:`, err);
      await rm(oggPath, { force: true }).catch(() => {});
      return null;
    } finally {
      await rm(buf.path, { force: true }).catch(() => {});
    }
  }

  /** Drop a session's buffered audio without producing a file. */
  discard(sessionId: string): void {
    const buf = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (!buf) return;
    void buf.tail.then(() => this.cleanup(buf)).catch(() => {});
  }

  private async cleanup(buf: SessionBuffer): Promise<void> {
    if (buf.handle) await buf.handle.close().catch(() => {});
    await rm(buf.path, { force: true }).catch(() => {});
  }
}
