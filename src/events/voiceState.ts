import { VoiceState } from "discord.js";
import {
  VoiceConnection,
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import { CONFIG } from "../utils/constants";
import {
  startRecording,
  stopRecording,
  cleanupRecording,
} from "../services/audioService";
import { generateSummaryWithRetry } from "../services/geminiService";
import {
  sendSummaryToChannel,
  sendErrorNotification,
} from "../services/messageService";
import { client } from "../index";

const activeConnections = new Map<string, VoiceConnection>();
const sessionStartTimes = new Map<string, number>();

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  const userId = newState.member?.id;
  const targetUserId = CONFIG.TARGET_USER_ID;

  if (userId !== targetUserId) {
    return;
  }

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  if (newChannelId && !oldChannelId) {
    await handleUserJoinedChannel(newState);
  }

  if (oldChannelId && !newChannelId) {
    await handleUserLeftChannel(oldState);
  }

  if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    await handleUserMovedChannel(oldState, newState);
  }
}

async function handleUserJoinedChannel(state: VoiceState): Promise<void> {
  const channelId = state.channelId;
  const guildId = state.guild.id;
  const username = state.member?.user.username || "Unknown";

  if (!channelId) {
    return;
  }

  console.log(`${username} joined VC ${channelId}`);

  try {
    const connection = joinVoiceChannel({
      channelId: channelId,
      guildId: guildId,
      adapterCreator: state.guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: true,
    });

    activeConnections.set(guildId, connection);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      console.log(`Connected to VC ${channelId}`);
    } catch (error) {
      console.error(`Failed to connect:`, error);
      connection.destroy();
      activeConnections.delete(guildId);
      return;
    }

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log(`Disconnected from VC ${channelId}`);
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (error) {
        console.log(`Permanently disconnected from ${channelId}`);
        connection.destroy();
        activeConnections.delete(guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log(`Connection destroyed for guild ${guildId}`);
      activeConnections.delete(guildId);
    });

    startRecording(connection, channelId, guildId);
    sessionStartTimes.set(guildId, Date.now());
    console.log("Recording started");
  } catch (error) {
    console.error(`Error joining VC:`, error);
    activeConnections.delete(guildId);
  }
}

async function handleUserLeftChannel(state: VoiceState): Promise<void> {
  const channelId = state.channelId || state.channel?.id || "Unknown";
  const guildId = state.guild.id;
  const username = state.member?.user.username || "Unknown";

  console.log(`${username} left VC ${channelId}`);

  try {
    const connection = getVoiceConnection(guildId);

    if (connection) {
      console.log(`Leaving VC ${channelId}`);

      const audioFiles = stopRecording(guildId);

      connection.destroy();
      activeConnections.delete(guildId);

      console.log(`Left VC ${channelId}`);

      if (audioFiles && audioFiles.length > 0) {
        console.log(`Processing ${audioFiles.length} audio files`);

        const startTime = sessionStartTimes.get(guildId) || Date.now();
        const duration = Date.now() - startTime;
        sessionStartTimes.delete(guildId);

        const summary = await generateSummaryWithRetry(audioFiles);

        if (summary) {
          console.log("Summary generated");

          const sent = await sendSummaryToChannel(client, summary, duration);

          if (sent) {
            console.log("Summary sent to Discord");
          } else {
            console.log("Failed to send to Discord, logging here:");
            console.log(summary);
          }
        } else {
          console.log("Failed to generate summary");
          await sendErrorNotification(
            client,
            "Failed to generate meeting summary. Please check the logs."
          );
        }

        cleanupRecording(audioFiles);
      }
    } else {
      console.log(`No active connection for guild ${guildId}`);
    }
  } catch (error) {
    console.error(`Error leaving VC:`, error);
  }
}

async function handleUserMovedChannel(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  const oldChannelId = oldState.channelId || "Unknown";
  const newChannelId = newState.channelId || "Unknown";
  const username = newState.member?.user.username || "Unknown";

  console.log(`${username} moved from ${oldChannelId} to ${newChannelId}`);

  await handleUserLeftChannel(oldState);
  await handleUserJoinedChannel(newState);
}

export function getActiveConnection(
  guildId: string
): VoiceConnection | undefined {
  return activeConnections.get(guildId);
}

export function cleanupAllConnections(): void {
  console.log(`Cleaning up ${activeConnections.size} connections`);
  for (const [guildId, connection] of activeConnections.entries()) {
    connection.destroy();
    activeConnections.delete(guildId);
  }
}
