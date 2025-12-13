import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { CONFIG } from "../utils/constants";

export async function sendSummaryToChannel(
  client: Client,
  summary: string,
  duration: number,
  driveUrl?: string
): Promise<boolean> {
  try {
    const channelId = CONFIG.MEETING_NOTES_CHANNEL_ID;

    if (!channelId) {
      console.log("No meeting notes channel configured");
      return false;
    }

    const channel = await client.channels.fetch(channelId);

    if (!channel || !(channel instanceof TextChannel)) {
      console.log("Channel not found or not a text channel");
      return false;
    }

    const durationMinutes = Math.round(duration / 60000);
    const durationSeconds = Math.round((duration % 60000) / 1000);
    const durationText =
      durationMinutes > 0
        ? `${durationMinutes}m ${durationSeconds}s`
        : `${durationSeconds}s`;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2) // Discord blurple
      .setTitle("📝 Meeting Summary")
      .setDescription(summary.slice(0, 4000)) // Discord embed limit
      .setTimestamp()
      .setFooter({
        text: `Duration: ${durationText}`,
      });

    // Add recording link if available
    if (driveUrl) {
      embed.addFields({
        name: "🎙️ Recording",
        value: `[Listen on Google Drive](${driveUrl})`,
        inline: false,
      });
    }

    await channel.send({ embeds: [embed] });
    console.log(`Summary sent to channel ${channelId}`);
    return true;
  } catch (error) {
    console.error("Failed to send summary:", error);
    return false;
  }
}

export async function sendErrorNotification(
  client: Client,
  errorMessage: string
): Promise<void> {
  try {
    const channelId = CONFIG.MEETING_NOTES_CHANNEL_ID;

    if (!channelId) {
      return;
    }

    const channel = await client.channels.fetch(channelId);

    if (!channel || !(channel instanceof TextChannel)) {
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xed4245) // Red
      .setTitle("⚠️ Error Processing Meeting")
      .setDescription(errorMessage)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Failed to send error notification:", error);
  }
}
