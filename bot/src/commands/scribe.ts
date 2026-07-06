import {
  ChannelType,
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../config";
import { guildConfig, participants, sessions, summaries, userLanguage } from "../db";
import { type SpokenLanguage, isSpokenLanguage } from "../db";
import { buildSummaryEmbed, type SummaryResult } from "../summary";
import type { Command } from "./types";

/** Probe the NLP service's /health so `/scribe status` reflects reality. */
async function nlpServiceStatus(): Promise<string> {
  try {
    const res = await fetch(`${config.nlpServiceUrl}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok ? "🟢 online" : `🟠 unhealthy (HTTP ${res.status})`;
  } catch {
    return "🔴 unreachable — captions and summaries are paused";
  }
}

/** Human-readable labels for the spoken-language choices. */
const LANGUAGE_LABELS: Record<SpokenLanguage, string> = {
  auto: "Auto-detect",
  en: "English",
  hi: "Hindi",
  th: "Thai",
};

const data = new SlashCommandBuilder()
  .setName("scribe")
  .setDescription("Configure which voice channels scribe auto-records.")
  // Manage Server gates every subcommand to admins by default.
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("watch")
      .setDescription("Add a voice channel to the auto-record list.")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The voice channel to watch.")
          .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("unwatch")
      .setDescription("Remove a voice channel from the auto-record list.")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The voice channel to stop watching.")
          .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("Show watched voice channels and the summary channel."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("set-summary-channel")
      .setDescription("Set the text channel where meeting summaries are posted.")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The text channel for summaries.")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("lang")
      .setDescription("Set a member's spoken language (for transcription + translation).")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("The member whose language to set.").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("language")
          .setDescription("Their spoken language. 'Auto-detect' lets Whisper decide per chunk.")
          .setRequired(true)
          .addChoices(
            { name: "Auto-detect", value: "auto" },
            { name: "English", value: "en" },
            { name: "Hindi", value: "hi" },
            { name: "Thai", value: "th" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show scribe's active recording sessions."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("summary")
      .setDescription("Re-post the summary for a session.")
      .addStringOption((opt) =>
        opt
          .setName("session")
          .setDescription("Session id (defaults to the most recent ended session).")
          .setRequired(false),
      ),
  );

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "This command can only be used in a server.", ...ephemeral });
    return;
  }

  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "watch": {
      const channel = interaction.options.getChannel("channel", true);
      const current = guildConfig.get(guildId);
      const watched = new Set(current?.watchedVcIds ?? []);
      if (watched.has(channel.id)) {
        await interaction.reply({ content: `Already watching <#${channel.id}>.`, ...ephemeral });
        return;
      }
      watched.add(channel.id);
      guildConfig.upsert({
        guildId,
        watchedVcIds: [...watched],
        summaryChannelId: current?.summaryChannelId ?? null,
      });
      await interaction.reply({
        content: `Now watching <#${channel.id}> — scribe will auto-record it.`,
        ...ephemeral,
      });
      return;
    }

    case "unwatch": {
      const channel = interaction.options.getChannel("channel", true);
      const current = guildConfig.get(guildId);
      const watched = new Set(current?.watchedVcIds ?? []);
      if (!watched.has(channel.id)) {
        await interaction.reply({ content: `<#${channel.id}> isn't being watched.`, ...ephemeral });
        return;
      }
      watched.delete(channel.id);
      guildConfig.upsert({
        guildId,
        watchedVcIds: [...watched],
        summaryChannelId: current?.summaryChannelId ?? null,
      });
      await interaction.reply({ content: `Stopped watching <#${channel.id}>.`, ...ephemeral });
      return;
    }

    case "list": {
      const current = guildConfig.get(guildId);
      const watched = current?.watchedVcIds ?? [];
      const watchedLine = watched.length
        ? `**Watched voice channels:**\n${watched.map((id) => `• <#${id}>`).join("\n")}`
        : "**Watched voice channels:** none yet — add one with `/scribe watch`.";
      const summaryLine = current?.summaryChannelId
        ? `**Summary channel:** <#${current.summaryChannelId}>`
        : "**Summary channel:** not set — use `/scribe set-summary-channel`.";
      await interaction.reply({ content: `${watchedLine}\n\n${summaryLine}`, ...ephemeral });
      return;
    }

    case "set-summary-channel": {
      const channel = interaction.options.getChannel("channel", true);
      const current = guildConfig.get(guildId);
      guildConfig.upsert({
        guildId,
        watchedVcIds: current?.watchedVcIds ?? [],
        summaryChannelId: channel.id,
      });
      await interaction.reply({
        content: `Summaries will be posted to <#${channel.id}>.`,
        ...ephemeral,
      });
      return;
    }

    case "lang": {
      const user = interaction.options.getUser("user", true);
      const language = interaction.options.getString("language", true);
      if (!isSpokenLanguage(language)) {
        await interaction.reply({ content: `Unsupported language \`${language}\`.`, ...ephemeral });
        return;
      }
      userLanguage.set(guildId, user.id, language);
      const detail =
        language === "auto"
          ? "scribe will auto-detect their language on each chunk."
          : `scribe will transcribe their speech as ${LANGUAGE_LABELS[language]} and translate it to English.`;
      await interaction.reply({
        content: `Set ${user}'s language to **${LANGUAGE_LABELS[language]}**. ${detail}`,
        ...ephemeral,
      });
      return;
    }

    case "status": {
      // The health probe can take up to 1.5s — defer so the reply never expires.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const nlp = await nlpServiceStatus();

      const active = sessions.listActive().filter((s) => s.guild_id === guildId);
      const sessionLines =
        active.length === 0
          ? "No active recording sessions."
          : `**Active sessions (${active.length}):**\n${active
              .map((s) => `• <#${s.channel_id}> — started <t:${Math.floor(s.started_at / 1000)}:R>`)
              .join("\n")}`;

      await interaction.editReply({ content: `${sessionLines}\n\nNLP service: ${nlp}` });
      return;
    }

    case "summary": {
      const requested = interaction.options.getString("session");
      const sessionId =
        requested ?? sessions.listByGuild(guildId).find((s) => s.status === "ended")?.id;
      if (!sessionId) {
        await interaction.reply({ content: "No session found to summarize.", ...ephemeral });
        return;
      }
      const stored = summaries.get<SummaryResult>(sessionId);
      if (!stored) {
        await interaction.reply({
          content: `No summary found for session \`${sessionId}\`.`,
          ...ephemeral,
        });
        return;
      }
      const names = participants.listBySession(sessionId).map((p) => p.username);
      const session = sessions.get(sessionId);
      const durationMs =
        session?.ended_at != null ? session.ended_at - session.started_at : undefined;
      const embed = buildSummaryEmbed(stored.structured, {
        sessionId,
        participants: names,
        durationMs,
      });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    default: {
      await interaction.reply({ content: "Unknown subcommand.", ...ephemeral });
    }
  }
}

export const scribeCommand: Command = { data, execute };
