/** The subset of the NLP service's ASR response the bot uses. */
export interface AsrChunkResult {
  text: string;
  language: string;
  language_probability: number;
  duration: number;
  confidence: number;
}

/**
 * POST a 16 kHz mono WAV chunk to the NLP service's live ASR endpoint and return
 * the transcription. `language` may be an ISO code or "auto" to detect.
 */
export async function transcribeChunk(
  baseUrl: string,
  wav: Buffer,
  opts: { language?: string } = {},
): Promise<AsrChunkResult> {
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "chunk.wav");
  form.append("language", opts.language ?? "auto");

  const res = await fetch(`${baseUrl}/asr/chunk`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`ASR request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AsrChunkResult;
}
