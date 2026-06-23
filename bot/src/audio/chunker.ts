import type { CapturedSegmentWithSession } from "../voice";
import { encodeWav } from "./wav";

/** 16 kHz mono signed-16-bit PCM: 16000 samples/s × 2 bytes = 32 bytes/ms. */
const BYTES_PER_MS = 32;

/** An ASR-ready audio chunk: a WAV slice of one speaker, with metadata. */
export interface AudioChunk {
  sessionId: string;
  userId: string;
  username: string;
  /** Monotonic per-user sequence number, starting at 0. */
  seq: number;
  /** Epoch ms (interpolated within the source utterance). */
  tsStart: number;
  tsEnd: number;
  /** 16 kHz mono WAV bytes. */
  wav: Buffer;
}

export interface SplitOptions {
  /** Preferred chunk length, ms. */
  targetMs: number;
  /** Hard maximum chunk length, ms. */
  maxMs: number;
  /** Analysis frame for energy search, ms. */
  frameMs: number;
}

const align2 = (n: number): number => n - (n % 2);

/** Mean absolute amplitude over a sample-aligned byte range. */
function frameEnergy(pcm: Buffer, start: number, end: number): number {
  let sum = 0;
  let count = 0;
  for (let i = start; i + 1 < end; i += 2) {
    sum += Math.abs(pcm.readInt16LE(i));
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

/**
 * Split 16 kHz mono PCM into pieces no longer than `maxMs`, cutting at the
 * quietest frame between `targetMs` and `maxMs` so boundaries fall on natural
 * pauses rather than mid-word. Short input passes through unsplit.
 */
export function splitPcm(pcm: Buffer, opts: SplitOptions): Buffer[] {
  const maxBytes = opts.maxMs * BYTES_PER_MS;
  if (pcm.length <= maxBytes) return [pcm];

  const frameBytes = Math.max(2, align2(opts.frameMs * BYTES_PER_MS));
  const targetBytes = opts.targetMs * BYTES_PER_MS;
  const pieces: Buffer[] = [];
  let start = 0;

  while (pcm.length - start > maxBytes) {
    const searchFrom = align2(start + targetBytes);
    const searchTo = Math.min(start + maxBytes, pcm.length);
    let cut = searchTo; // fall back to a hard cut at maxMs
    let quietest = Number.POSITIVE_INFINITY;
    for (let f = searchFrom; f + frameBytes <= searchTo; f += frameBytes) {
      const energy = frameEnergy(pcm, f, f + frameBytes);
      if (energy < quietest) {
        quietest = energy;
        cut = f;
      }
    }
    pieces.push(pcm.subarray(start, cut));
    start = cut;
  }
  pieces.push(pcm.subarray(start));
  return pieces;
}

export interface AudioChunkerOptions {
  onChunk: (chunk: AudioChunk) => void;
  /** Preferred chunk length, ms. Default 4000. */
  targetMs?: number;
  /** Hard maximum chunk length, ms. Default 5000. */
  maxMs?: number;
  /** Energy-search frame, ms. Default 20. */
  frameMs?: number;
}

/**
 * Turns per-speaker captured utterances into ordered, ASR-ready WAV chunks.
 * Utterance boundaries are already silence-bounded (from capture); long
 * utterances are further split at internal low-energy points. Each user has its
 * own monotonic sequence so ordering is preserved per speaker.
 */
export class AudioChunker {
  private readonly onChunk: (chunk: AudioChunk) => void;
  private readonly split: SplitOptions;
  private readonly seqByUser = new Map<string, number>();

  constructor(options: AudioChunkerOptions) {
    this.onChunk = options.onChunk;
    this.split = {
      targetMs: options.targetMs ?? 4000,
      maxMs: options.maxMs ?? 5000,
      frameMs: options.frameMs ?? 20,
    };
  }

  push(segment: CapturedSegmentWithSession): void {
    const pieces = splitPcm(segment.pcm, this.split);
    const totalBytes = segment.pcm.length;
    const durationMs = segment.endedAt - segment.startedAt;
    const at = (offsetBytes: number): number =>
      totalBytes === 0
        ? segment.startedAt
        : segment.startedAt + Math.round((offsetBytes / totalBytes) * durationMs);

    let offset = 0;
    for (const piece of pieces) {
      const seq = this.nextSeq(segment.userId);
      const tsStart = at(offset);
      offset += piece.length;
      const tsEnd = at(offset);
      this.onChunk({
        sessionId: segment.sessionId,
        userId: segment.userId,
        username: segment.username,
        seq,
        tsStart,
        tsEnd,
        wav: encodeWav(piece),
      });
    }
  }

  private nextSeq(userId: string): number {
    const next = this.seqByUser.get(userId) ?? 0;
    this.seqByUser.set(userId, next + 1);
    return next;
  }
}
