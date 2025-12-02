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
import { transcribeAudioWithRetry } from "../services/transcriptionService";
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

  const existingConnection = getVoiceConnection(guildId);
  if (
    existingConnection &&
    existingConnection.state.status !== VoiceConnectionStatus.Destroyed
  ) {
    console.log(`Already connected to guild ${guildId}`);
    return;
  }

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
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      console.log(`Connected to VC ${channelId}`);
    } catch (error) {
      console.error(`Failed to connect (timeout or aborted):`, error);
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
      activeConnections.delete(guildId);
      sessionStartTimes.delete(guildId);
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
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
          connection.destroy();
        }
        activeConnections.delete(guildId);
        sessionStartTimes.delete(guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log(`Connection destroyed for guild ${guildId}`);
      activeConnections.delete(guildId);
      sessionStartTimes.delete(guildId);
    });

    startRecording(connection, channelId, guildId);
    sessionStartTimes.set(guildId, Date.now());
    console.log("Recording started");
  } catch (error) {
    console.error(`Error joining VC:`, error);
    activeConnections.delete(guildId);
    sessionStartTimes.delete(guildId);
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

      const startTime = sessionStartTimes.get(guildId);
      const audioFiles = stopRecording(guildId);

      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
      activeConnections.delete(guildId);

      console.log(`Left VC ${channelId}`);

      if (audioFiles && audioFiles.length > 0) {
        const duration = startTime ? Date.now() - startTime : 0;
        sessionStartTimes.delete(guildId);

        const durationInSeconds = Math.round(duration / 1000);
        const durationInMinutes = durationInSeconds / 60;

        console.log(
          `Session duration: ${durationInSeconds}s (${durationInMinutes.toFixed(
            1
          )} minutes)`
        );

        if (duration < 2 * 60 * 1000) {
          console.log("Session < 2 minutes, skipping summary");
          cleanupRecording(audioFiles);
          return;
        }

        console.log(`Processing ${audioFiles.length} audio files`);

        const transcript = await transcribeAudioWithRetry(audioFiles);

        if (!transcript) {
          console.log("Failed to transcribe audio");
          await sendErrorNotification(
            client,
            "Failed to transcribe meeting audio."
          );
          cleanupRecording(audioFiles);
          return;
        }

        console.log("Transcription successful, generating summary...");

        const summary = await generateSummaryWithRetry(transcript);

        if (summary) {
          console.log("Summary generated");

          const sent = await sendSummaryToChannel(client, summary, duration);

          if (sent) {
            console.log("Summary sent to Discord");
          } else {
            console.log("Failed to send, logging:");
            console.log(summary);
          }
        } else {
          console.log("Failed to generate summary");
          await sendErrorNotification(
            client,
            "Failed to generate meeting summary."
          );
        }

        cleanupRecording(audioFiles);
      } else {
        sessionStartTimes.delete(guildId);
      }
    } else {
      console.log(`No active connection for guild ${guildId}`);
      sessionStartTimes.delete(guildId);
    }
  } catch (error) {
    console.error(`Error leaving VC:`, error);
    sessionStartTimes.delete(guildId);
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
    if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
    activeConnections.delete(guildId);
  }
}
