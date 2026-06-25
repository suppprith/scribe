import type { ServerMessage } from "@scribe/shared";
import type { Client } from "discord.js";
import { guildConfig, sessions, summaries } from "../db";
import { assembleTranscript } from "../transcript";
import { summarizeTranscript } from "./client";
import { buildSummaryEmbed } from "./embed";

export interface DeliverDeps {
  client: Client;
  nlpServiceUrl: string;
  broadcast: (message: ServerMessage) => void;
}

/**
 * Run the end-of-session summary: assemble the transcript, summarize it via the
 * NLP service, persist the result, broadcast it to the web, and post a rich
 * embed to the guild's summary channel. Failures post a clear notice to the
 * channel rather than vanishing silently.
 */
export async function deliverSummary(deps: DeliverDeps, sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  const transcript = assembleTranscript(sessionId);
  const channelId = guildConfig.get(session.guild_id)?.summaryChannelId ?? undefined;
  const durationMs = session.ended_at != null ? session.ended_at - session.started_at : undefined;

  if (!transcript.fullText.trim()) {
    console.log(`[scribe] session ${sessionId} produced no captions — skipping summary`);
    return;
  }

  try {
    const summary = await summarizeTranscript(deps.nlpServiceUrl, {
      transcript: transcript.fullText,
      utterances: transcript.utterances,
      participants: transcript.participants,
      duration_seconds: durationMs != null ? durationMs / 1000 : undefined,
    });

    summaries.upsert({ sessionId, structured: summary });
    deps.broadcast({ type: "summary_ready", sessionId, markdown: summary.prose });

    if (channelId) {
      const channel = await deps.client.channels.fetch(channelId).catch(() => null);
      if (channel?.isSendable()) {
        const embed = buildSummaryEmbed(summary, {
          sessionId,
          participants: transcript.participants,
          durationMs,
        });
        await channel.send({ embeds: [embed] });
        summaries.markPosted(sessionId);
      } else {
        console.warn(`[scribe] summary channel ${channelId} is not sendable`);
      }
    }
  } catch (err) {
    console.error(`[scribe] summary delivery failed for ${sessionId}:`, err);
    if (channelId) {
      const channel = await deps.client.channels.fetch(channelId).catch(() => null);
      if (channel?.isSendable()) {
        await channel
          .send(`⚠️ scribe couldn't generate a summary for the last session: ${(err as Error).message}`)
          .catch(() => {});
      }
    }
  }
}
