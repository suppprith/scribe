import type { SearchHit, SearchMode, SearchResponse, TranscriptLine } from "@scribe/shared";

/**
 * Transcript search, backed by the NLP service. Keyword mode ranks the
 * session's lines with TF-IDF (Lab 9). Semantic mode first expands the query
 * with Word2Vec neighbours drawn from the transcript itself (Lab 10), then
 * ranks with the same TF-IDF index — so "budget" can also surface "cost" or
 * "funding" lines.
 */

interface NlpSearchHit {
  index: number;
  document: string;
  score: number;
}

async function nlpSearch(
  baseUrl: string,
  documents: string[],
  query: string,
  topN: number,
): Promise<NlpSearchHit[]> {
  const res = await fetch(`${baseUrl}/nlp/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documents, query, top_n: topN }),
  });
  if (!res.ok) throw new Error(`nlp /search failed: ${res.status}`);
  return ((await res.json()) as { hits: NlpSearchHit[] }).hits;
}

async function nlpSimilar(
  baseUrl: string,
  documents: string[],
  word: string,
  topN: number,
): Promise<string[]> {
  const res = await fetch(`${baseUrl}/nlp/similar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documents, word, top_n: topN }),
  });
  if (!res.ok) throw new Error(`nlp /similar failed: ${res.status}`);
  return ((await res.json()) as { similar: { word: string }[] }).similar.map((s) => s.word);
}

function tokenize(query: string): string[] {
  return query.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

export async function searchTranscript(
  baseUrl: string,
  lines: TranscriptLine[],
  query: string,
  mode: SearchMode,
  topN = 10,
): Promise<SearchResponse> {
  const documents = lines.map((l) => l.text);
  let terms: string[] = [query.trim()];

  if (mode === "semantic" && documents.length > 0) {
    const expansions = new Set(tokenize(query));
    for (const token of tokenize(query)) {
      try {
        for (const w of await nlpSimilar(baseUrl, documents, token, 3)) expansions.add(w);
      } catch {
        /* token not in the transcript's vocabulary — skip expanding it */
      }
    }
    terms = [...expansions];
  }

  const effectiveQuery = mode === "semantic" ? terms.join(" ") : query;
  const rawHits = documents.length > 0 ? await nlpSearch(baseUrl, documents, effectiveQuery, topN) : [];

  const hits: SearchHit[] = rawHits
    .filter((h) => h.score > 0 && lines[h.index])
    .map((h) => {
      const line = lines[h.index]!;
      return {
        lineIndex: h.index,
        userId: line.userId,
        username: line.username,
        text: line.text,
        tsStart: line.tsStart,
        score: h.score,
      };
    });

  return { query, mode, terms, hits };
}
