import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { CONFIG } from "../utils/constants";

export async function sendSummaryToChannel(
  client: Client,
  summary: string,
  duration: number
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

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("Meeting Summary")
      .setDescription(summary)
      .setTimestamp()
      .setFooter({
        text: `Duration: ${Math.round(duration / 1000)}s`,
      });

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
      .setColor(0xff0000)
      .setTitle("Error Processing Meeting")
      .setDescription(errorMessage)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Failed to send error notification:", error);
  }
}
