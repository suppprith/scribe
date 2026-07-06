import { createLogger } from "../log";

const log = createLogger("scribe.retry");

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Delay before the first retry, doubled each attempt. Default 500. */
  baseDelayMs?: number;
  /** Ceiling for the backoff delay. Default 8000. */
  maxDelayMs?: number;
  /** Name used in retry logs (e.g. "asr chunk"). */
  label?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying on rejection with exponential backoff. Absorbs the brief
 * outages this system actually hits — an NLP-service restart mid-session, a
 * transient network refusal — instead of dropping the chunk or the summary.
 * The final failure is rethrown for the caller's own error handling.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const base = options.baseDelayMs ?? 500;
  const max = options.maxDelayMs ?? 8000;
  const label = options.label ?? "operation";

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const delay = Math.min(max, base * 2 ** (attempt - 1));
      log.warn(
        `${label} failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms: ${(err as Error).message}`,
      );
      await sleep(delay);
    }
  }
  throw lastError;
}
