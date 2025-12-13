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
  mergeAudioFiles,
  convertToMp3,
} from "../services/audioService";
import { generateSummaryWithRetry } from "../services/geminiService";
import {
  sendSummaryToChannel,
  sendErrorNotification,
} from "../services/messageService";
import {
  uploadToGoogleDrive,
  generateMeetingFileName,
} from "../services/driveService";
import { client } from "../index";

const activeConnections = new Map<string, VoiceConnection>();
const sessionStartTimes = new Map<string, number>();

/**
 * Safely destroy a voice connection if it's not already destroyed
 */
function safeDestroyConnection(
  connection: VoiceConnection,
  guildId: string
): void {
  try {
    if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
  } catch (error) {
    // Already destroyed, ignore
  }
  activeConnections.delete(guildId);
}

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  const userId = newState.member?.id || oldState.member?.id;
  const targetUserId = CONFIG.TARGET_USER_ID;

  if (userId !== targetUserId) {
    return;
  }

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  // User joined a voice channel
  if (newChannelId && !oldChannelId) {
    await handleUserJoinedChannel(newState);
  }

  // User left a voice channel
  if (oldChannelId && !newChannelId) {
    await handleUserLeftChannel(oldState);
  }

  // User moved between channels
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

  // Check if we're already connected
  const existingConnection = getVoiceConnection(guildId);
  if (existingConnection) {
    console.log(`[INFO] Already connected to a VC in guild ${guildId}`);
    return;
  }

  console.log(`[JOIN] ${username} joined VC ${channelId}`);

  let connection: VoiceConnection | null = null;

  try {
    connection = joinVoiceChannel({
      channelId: channelId,
      guildId: guildId,
      adapterCreator: state.guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: true,
    });

    activeConnections.set(guildId, connection);

    // Wait for connection to be ready
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`[CONNECTED] Bot joined VC ${channelId}`);

    // Handle disconnection events
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log(`[DISCONNECTED] Bot disconnected from VC`);
      if (!connection) return;

      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        console.log(`[CLEANUP] Permanent disconnect`);
        safeDestroyConnection(connection, guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log(`[DESTROYED] Connection for guild ${guildId}`);
      activeConnections.delete(guildId);
    });

    // Start recording
    startRecording(connection, channelId, guildId);
    sessionStartTimes.set(guildId, Date.now());
    console.log(`[RECORDING] Started recording`);
  } catch (error) {
    console.error(`[ERROR] Failed to connect to VC:`, error);
    if (connection) {
      safeDestroyConnection(connection, guildId);
    }
    activeConnections.delete(guildId);
  }
}

async function handleUserLeftChannel(state: VoiceState): Promise<void> {
  const channelId = state.channelId || state.channel?.id || "Unknown";
  const guildId = state.guild.id;
  const username = state.member?.user.username || "Unknown";

  console.log(`[LEAVE] ${username} left VC ${channelId}`);

  try {
    const connection = getVoiceConnection(guildId);

    if (!connection) {
      console.log(`[INFO] No active connection for guild ${guildId}`);
      return;
    }

    console.log(`[STOPPING] Stopping recording...`);

    // Stop recording and get audio files
    const audioFiles = await stopRecording(guildId);

    // Destroy connection safely
    safeDestroyConnection(connection, guildId);
    console.log(`[LEFT] Bot left VC`);

    // Process recording
    if (!audioFiles || audioFiles.length === 0) {
      console.log(`[INFO] No audio files recorded`);
      return;
    }

    console.log(`[PROCESS] Processing ${audioFiles.length} audio files`);

    const startTime = sessionStartTimes.get(guildId) || Date.now();
    const duration = Date.now() - startTime;
    sessionStartTimes.delete(guildId);

    // Wait for streams to flush
    console.log(`[WAIT] Waiting for streams to flush...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 1: Merge audio files
    console.log(`[MERGE] Merging audio files...`);
    const mergedAudioFile = await mergeAudioFiles(audioFiles, guildId);

    if (!mergedAudioFile) {
      console.error(`[ERROR] Failed to merge audio files`);
      await sendErrorNotification(
        client,
        "Failed to process audio files. No valid audio content found."
      );
      cleanupRecording(audioFiles);
      return;
    }

    // Step 2: Convert to MP3
    console.log(`[CONVERT] Converting to MP3...`);
    const mp3File = await convertToMp3(mergedAudioFile);

    let driveUrl: string | undefined;

    if (mp3File) {
      // Step 3: Upload to Google Drive
      console.log(`[UPLOAD] Uploading to Google Drive...`);
      const fileName = generateMeetingFileName();
      const driveResult = await uploadToGoogleDrive(mp3File, fileName);

      if (driveResult) {
        driveUrl = driveResult.webViewLink;
        console.log(`[DRIVE] Uploaded: ${driveUrl}`);
      } else {
        console.log(`[WARN] Failed to upload to Google Drive`);
      }
    } else {
      console.log(`[WARN] MP3 conversion failed, skipping Drive upload`);
    }

    // Step 4: Generate summary using Gemini
    console.log(`[SUMMARY] Generating meeting summary...`);
    const summary = await generateSummaryWithRetry([mergedAudioFile]);

    if (summary) {
      console.log(`[SUMMARY] Summary generated`);

      // Step 5: Send to Discord with Drive link
      const sent = await sendSummaryToChannel(
        client,
        summary,
        duration,
        driveUrl
      );

      if (sent) {
        console.log(`[DISCORD] Summary sent to channel`);
      } else {
        console.log(`[ERROR] Failed to send summary to Discord`);
        console.log(summary);
      }
    } else {
      console.log(`[ERROR] Failed to generate summary`);
      await sendErrorNotification(
        client,
        "Failed to generate meeting summary. Please check the logs."
      );
    }

    // Cleanup all temporary files
    const filesToClean = [...audioFiles];
    if (mergedAudioFile && !audioFiles.includes(mergedAudioFile)) {
      filesToClean.push(mergedAudioFile);
    }
    if (mp3File) {
      filesToClean.push(mp3File);
    }
    cleanupRecording(filesToClean);
    console.log(`[CLEANUP] Temporary files cleaned up`);
  } catch (error) {
    console.error(`[ERROR] Error processing recording:`, error);
  }
}

async function handleUserMovedChannel(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  const oldChannelId = oldState.channelId || "Unknown";
  const newChannelId = newState.channelId || "Unknown";
  const username = newState.member?.user.username || "Unknown";

  console.log(
    `[MOVE] ${username} moved from ${oldChannelId} to ${newChannelId}`
  );

  // Process the leave and join as separate events
  await handleUserLeftChannel(oldState);
  await handleUserJoinedChannel(newState);
}

export function getActiveConnection(
  guildId: string
): VoiceConnection | undefined {
  return activeConnections.get(guildId);
}

export function cleanupAllConnections(): void {
  console.log(`[CLEANUP] Cleaning up ${activeConnections.size} connections`);
  for (const [guildId, connection] of activeConnections.entries()) {
    safeDestroyConnection(connection, guildId);
  }
}
