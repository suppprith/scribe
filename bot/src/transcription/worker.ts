import type { Caption } from "@scribe/shared";
import type { AudioChunk, ChunkQueue } from "../audio";
import { createLogger } from "../log";
import type { AsrChunkResult } from "./asrClient";

const log = createLogger("scribe.transcribe");

export interface TranscriptionWorkerOptions {
  queue: ChunkQueue<AudioChunk>;
  /** Transcribe a WAV chunk (the NLP service call). */
  transcribe: (wav: Buffer, language?: string) => Promise<AsrChunkResult>;
  /**
   * Resolve the ASR language hint for a chunk (the speaker's configured
   * language). Return `undefined`/`"auto"` to let Whisper detect. Looked up per
   * chunk so a mid-session `/scribe lang` change takes effect immediately.
   */
  resolveLanguage?: (chunk: AudioChunk) => string | undefined;
  /**
   * Translate a non-English caption to English. Called only for finals whose
   * detected language isn't English; returns `null` (kept original-only) on any
   * failure. `to` is the target language of the returned text.
   */
  translate?: (text: string, srcLang: string) => Promise<{ text: string; to: string } | null>;
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
  /**
   * Reuse a speaker's already-detected language for this many chunks before
   * letting the model detect again. Detection costs about as much as the
   * transcription itself, but a speaker can switch language mid-meeting, so it
   * must not stick forever.
   */
  private static readonly LANGUAGE_REUSE_LIMIT = 8;

  private running = false;
  private readonly lastText = new Map<string, string>();
  /** Per-speaker detected language and how many chunks it has been reused for. */
  private readonly detected = new Map<string, { code: string; uses: number }>();

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
        log.error(
          `transcription failed for session ${chunk.sessionId} ${chunk.userId}#${chunk.seq} — dropping chunk:`,
          err,
        );
      }
    }
  }

  /** The speaker's configured language, else their recently detected one. */
  private languageHint(key: string, configured: string | undefined): string | undefined {
    if (configured) return configured;
    const entry = this.detected.get(key);
    return entry && entry.uses < TranscriptionWorker.LANGUAGE_REUSE_LIMIT ? entry.code : undefined;
  }

  /** Track the detected language so the next chunks can skip detection. */
  private rememberLanguage(key: string, hint: string | undefined, result: AsrChunkResult): void {
    const entry = this.detected.get(key);
    if (hint && entry) {
      entry.uses++;
      return;
    }
    // Only trust a confident detection — a bad guess would pin the wrong
    // language (and so the wrong translation) for the next several chunks.
    if (result.language && result.language_probability >= 0.85) {
      this.detected.set(key, { code: result.language, uses: 0 });
    }
  }

  private async handle(chunk: AudioChunk): Promise<void> {
    const key = `${chunk.sessionId}:${chunk.userId}`;
    const configured = this.options.resolveLanguage?.(chunk);
    const hint = this.languageHint(key, configured);
    const result = await this.options.transcribe(chunk.wav, hint);
    if (!configured) this.rememberLanguage(key, hint, result);
    const text = result.text.trim();
    if (!text) return;

    const stitched = stitch(this.lastText.get(key) ?? "", text).trim();
    this.lastText.set(key, text);
    if (!stitched) return; // duplicate of the previous chunk

    // Non-English turns get an English translation attached alongside the
    // original; failures leave the caption original-only.
    let translatedText: string | undefined;
    let translatedTo: string | undefined;
    const lang = result.language;
    if (this.options.translate && lang && lang !== "en") {
      const t = await this.options.translate(stitched, lang);
      if (t && t.text && t.text !== stitched) {
        translatedText = t.text;
        translatedTo = t.to;
      }
    }

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
      translatedText,
      translatedTo,
    });
  }
}
