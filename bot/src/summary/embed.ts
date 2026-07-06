import { EmbedBuilder } from "discord.js";
import type { SummaryResult } from "./types";

const SCRIBE_COLOR = 0x5865f2;

/** Join items as a bullet list capped to Discord's 1024-char field limit. */
function bullets(items: string[], max = 1024): string {
  let out = "";
  for (const item of items) {
    const line = `• ${item}\n`;
    if (out.length + line.length > max) {
      out += "…";
      break;
    }
    out += line;
  }
  return out.trimEnd() || "—";
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export interface SummaryEmbedMeta {
  sessionId: string;
  participants: string[];
  durationMs?: number;
  links?: { label: string; url: string }[];
}

/** Build the rich Discord embed posted for a meeting summary. */
export function buildSummaryEmbed(summary: SummaryResult, meta: SummaryEmbedMeta): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle("Meeting summary").setColor(SCRIBE_COLOR);

  if (summary.overview) embed.setDescription(summary.overview.slice(0, 4096));
  if (summary.topics.length) embed.addFields({ name: "Topics", value: bullets(summary.topics) });
  if (summary.decisions.length) embed.addFields({ name: "Decisions", value: bullets(summary.decisions) });
  if (summary.action_items.length) {
    embed.addFields({ name: "Action items", value: bullets(summary.action_items) });
  }
  if (meta.participants.length) {
    embed.addFields({ name: "Participants", value: meta.participants.join(", ").slice(0, 1024), inline: true });
  }
  if (meta.durationMs != null) {
    embed.addFields({ name: "Duration", value: formatDuration(meta.durationMs), inline: true });
  }
  if (meta.links?.length) {
    embed.addFields({ name: "Links", value: meta.links.map((l) => `[${l.label}](${l.url})`).join(" · ") });
  }
  embed.setFooter({ text: `session ${meta.sessionId}` });
  return embed;
}
