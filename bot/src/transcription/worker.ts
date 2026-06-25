import type { Caption } from "@scribe/shared";
import type { AudioChunk, ChunkQueue } from "../audio";
import type { AsrChunkResult } from "./asrClient";

export interface TranscriptionWorkerOptions {
  queue: ChunkQueue<AudioChunk>;
  /** Transcribe a WAV chunk (the NLP service call). */
  transcribe: (wav: Buffer, language?: string) => Promise<AsrChunkResult>;
  /** Emit a finished caption (persist + broadcast). */
  onCaption: (caption: Caption) => void;
  /** Max chunks transcribed in parallel. Default 1 (single shared CPU). */
  concurrency?: number;
}

/**
 * Remove the overlap between the end of `prev` and the start of `next` at word
 * granularity, so consecutive chunks of the same speaker don't repeat words.
 * Returns "" when `next` is fully contained in `prev` (a duplicate).
 */
export function stitch(prev: string, next: string): string {
  const prevWords = prev.split(/\s+/).filter(Boolean);
  const nextWords = next.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(prevWords.length, nextWords.length);
  for (let k = maxOverlap; k > 0; k--) {
    const tail = prevWords.slice(prevWords.length - k).join(" ").toLowerCase();
    const head = nextWords.slice(0, k).join(" ").toLowerCase();
    if (tail === head) return nextWords.slice(k).join(" ");
  }
  return next;
}

/**
 * Drains the chunk queue, transcribes each chunk via the NLP service, and emits
 * an attributed final caption. A bounded concurrency keeps the single CPU from
 * being overwhelmed; per-speaker stitching drops duplicate/overlapping text.
 */
export class TranscriptionWorker {
  private running = false;
  private readonly lastText = new Map<string, string>();

  constructor(private readonly options: TranscriptionWorkerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const workers = Math.max(1, this.options.concurrency ?? 1);
    for (let i = 0; i < workers; i++) void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const chunk = await this.options.queue.dequeue();
      if (!this.running) break;
      try {
        await this.handle(chunk);
      } catch (err) {
        console.error(`[scribe] transcription failed for ${chunk.userId}#${chunk.seq}:`, err);
      }
    }
  }

  private async handle(chunk: AudioChunk): Promise<void> {
    const result = await this.options.transcribe(chunk.wav);
    const text = result.text.trim();
    if (!text) return;

    const key = `${chunk.sessionId}:${chunk.userId}`;
    const stitched = stitch(this.lastText.get(key) ?? "", text).trim();
    this.lastText.set(key, text);
    if (!stitched) return; // duplicate of the previous chunk

    this.options.onCaption({
      sessionId: chunk.sessionId,
      userId: chunk.userId,
      username: chunk.username,
      text: stitched,
      tsStart: chunk.tsStart,
      tsEnd: chunk.tsEnd,
      isFinal: true,
      seq: chunk.seq,
      lang: result.language,
    });
  }
}
