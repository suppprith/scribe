import type { SummaryResult } from "./types";

export interface SummarizeInput {
  transcript?: string;
  utterances?: { speaker: string; text: string }[];
  participants?: string[];
  duration_seconds?: number;
}

/** POST an assembled transcript to the NLP service and get a structured summary. */
export async function summarizeTranscript(
  baseUrl: string,
  input: SummarizeInput,
): Promise<SummaryResult> {
  const res = await fetch(`${baseUrl}/summarize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`summarize request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SummaryResult;
}
