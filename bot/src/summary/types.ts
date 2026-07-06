/** The structured summary returned by the NLP service's /summarize endpoint. */
export interface SummaryResult {
  overview: string;
  topics: string[];
  keywords: string[];
  decisions: string[];
  action_items: string[];
  highlights: string[];
  prose: string;
}
