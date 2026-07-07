import type { ServerMessage } from "@scribe/shared";
import type { Client } from "discord.js";
import type { Recording } from "../audio";
import { guildConfig, sessions, summaries } from "../db";
import type { DriveService } from "../drive";
import { createLogger } from "../log";
import { persistSessionToDrive, type PersistedLink } from "../storage/persistSession";
import { assembleTranscript, backfillTranslations } from "../transcript";
import { createTranslator } from "../transcription";
import { withRetry } from "../util/retry";
import { summarizeTranscript } from "./client";
import { buildSummaryEmbed } from "./embed";

const log = createLogger("scribe.summary");

/** Minimal recorder surface: produce or drop a session's buffered audio. */
export interface SessionAudio {
  finalize(sessionId: string): Promise<Recording | null>;
  discard(sessionId: string): void;
}

export interface DeliverDeps {
  client: Client;
  nlpServiceUrl: string;
  broadcast: (message: ServerMessage) => void;
  /** Drive service, or null/undefined when storage is disabled. */
  drive?: DriveService | null;
  /** Session audio recorder; its buffer is always released here. */
  recorder?: SessionAudio;
}

/** Readable, sortable Drive folder name for a session: date + short id. */
function folderNameFor(startedAt: number, sessionId: string): string {
  const iso = new Date(startedAt).toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  return `${iso}_${sessionId.slice(0, 8)}`;
}

/**
 * Run the end-of-session summary: assemble the transcript, summarize it via the
 * NLP service, persist the result, broadcast it to the web, upload the artifacts
 * to Drive, and post a rich embed (with storage links) to the guild's summary
 * channel. Failures post a clear notice to the channel rather than vanishing
 * silently. The recorder's audio buffer is always released, upload or not.
 */
export async function deliverSummary(deps: DeliverDeps, sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    deps.recorder?.discard(sessionId);
    return;
  }

  // Ensure every non-English turn has an English translation before assembling,
  // so the summary (built from the English text) is coherent for mixed meetings.
  const translator = createTranslator(deps.nlpServiceUrl);
  await backfillTranslations(sessionId, async (text, src) => {
    const r = await translator(text, src, "en");
    return r ? { text: r.translatedText, to: r.tgt } : null;
  });

  const transcript = assembleTranscript(sessionId);
  const channelId = guildConfig.get(session.guild_id)?.summaryChannelId ?? undefined;
  const durationMs = session.ended_at != null ? session.ended_at - session.started_at : undefined;

  if (!transcript.fullText.trim()) {
    log.info(`session ${sessionId} produced no captions — skipping summary`);
    deps.recorder?.discard(sessionId);
    return;
  }

  try {
    // Retry with backoff: a summary is produced once per meeting, so it's worth
    // riding out an NLP-service restart rather than losing it.
    const summary = await withRetry(
      () =>
        summarizeTranscript(deps.nlpServiceUrl, {
          transcript: transcript.fullText,
          utterances: transcript.utterances,
          participants: transcript.participants,
          duration_seconds: durationMs != null ? durationMs / 1000 : undefined,
        }),
      { attempts: 4, baseDelayMs: 2000, label: `summarize ${sessionId}` },
    );

    summaries.upsert({ sessionId, structured: summary });
    deps.broadcast({ type: "summary_ready", sessionId, markdown: summary.prose });

    // Upload recording + transcript + summary to Drive (best-effort). When Drive
    // is disabled we still release the recorder's buffered audio.
    let links: PersistedLink[] = [];
    if (deps.drive) {
      const audio = deps.recorder ? await deps.recorder.finalize(sessionId) : null;
      links = await persistSessionToDrive(deps.drive, {
        guildId: session.guild_id,
        sessionId,
        folderName: folderNameFor(session.started_at, sessionId),
        audio,
        transcriptText: transcript.fullText,
        summary,
      });
    } else {
      deps.recorder?.discard(sessionId);
    }

    if (channelId) {
      const channel = await deps.client.channels.fetch(channelId).catch(() => null);
      if (channel?.isSendable()) {
        const embed = buildSummaryEmbed(summary, {
          sessionId,
          participants: transcript.participants,
          durationMs,
          links,
        });
        await channel.send({ embeds: [embed] });
        summaries.markPosted(sessionId);
      } else {
        log.warn(`summary channel ${channelId} is not sendable`);
      }
    }
  } catch (err) {
    log.error(`summary delivery failed for ${sessionId}:`, err);
    deps.recorder?.discard(sessionId);
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
