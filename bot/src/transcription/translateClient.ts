/** The subset of the NLP service's /nlp/translate response the bot uses. */
export interface TranslateResult {
  translatedText: string;
  src: string;
  tgt: string;
}

/**
 * POST text to the NLP service's `/nlp/translate`. Returns `null` on any failure
 * (unsupported pair, model not downloaded, service down) so the caption pipeline
 * degrades to the original text instead of dropping the turn.
 */
export async function translateText(
  baseUrl: string,
  text: string,
  src: string,
  tgt = "en",
): Promise<TranslateResult | null> {
  try {
    const res = await fetch(`${baseUrl}/nlp/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, src, tgt }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TranslateResult;
  } catch {
    return null;
  }
}

/** A cached translate function: identical (src, tgt, text) is translated once. */
export type Translator = (text: string, src: string, tgt?: string) => Promise<TranslateResult | null>;

/**
 * Build a translator over the NLP service that memoizes successful results in a
 * bounded (FIFO) cache, so repeated identical utterances don't hit the model
 * twice. Failures aren't cached, so a transient outage can recover on retry.
 */
export function createTranslator(baseUrl: string, opts: { maxEntries?: number } = {}): Translator {
  const max = opts.maxEntries ?? 1000;
  const cache = new Map<string, TranslateResult>();
  return async (text, src, tgt = "en") => {
    const key = `${src}>${tgt}:${text}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const result = await translateText(baseUrl, text, src, tgt);
    if (result) {
      if (cache.size >= max) cache.delete(cache.keys().next().value as string);
      cache.set(key, result);
    }
    return result;
  };
}
