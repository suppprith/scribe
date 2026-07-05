import type { MeetingSummary } from "@scribe/shared";

/** Serialize a structured summary to Markdown — used by the "Copy" action. */
export function summaryToMarkdown(s: MeetingSummary): string {
  const lines: string[] = ["# Meeting summary", "", s.overview.trim(), ""];

  const section = (title: string, items: string[], bullet = "-") => {
    if (items.length === 0) return;
    lines.push(`## ${title}`);
    for (const item of items) lines.push(`${bullet} ${item}`);
    lines.push("");
  };

  section("Topics", s.topics);
  section("Decisions", s.decisions);
  section("Action items", s.action_items);
  section("Highlights", s.highlights);
  if (s.keywords.length) {
    lines.push("## Keywords", s.keywords.join(", "), "");
  }
  return lines.join("\n").trim() + "\n";
}
