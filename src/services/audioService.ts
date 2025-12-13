import { VoiceConnection, EndBehaviorType } from "@discordjs/voice";
import {
  createWriteStream,
  existsSync,
  unlinkSync,
  WriteStream,
  mkdirSync,
  statSync,
} from "node:fs";
import { CONFIG } from "../utils/constants";
import { exec, spawn, ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import ffmpegPath from "ffmpeg-static";

const execAsync = promisify(exec);

// Use bundled ffmpeg
const FFMPEG = ffmpegPath || "ffmpeg";
console.log(`[AUDIO] Using ffmpeg: ${FFMPEG}`);

interface RecordingSession {
  channelId: string;
  guildId: string;
  startTime: Date;
  streams: Map<string, WriteStream>;
  userFiles: string[];
  subscriptions: Map<string, Readable>;
  ffmpegProcesses: Map<string, ChildProcess>;
}

const activeSessions = new Map<string, RecordingSession>();

export function startRecording(
  connection: VoiceConnection,
  channelId: string,
  guildId: string
): void {
  const timestamp = Date.now();

  // Clean up any existing session
  const existingSession = activeSessions.get(guildId);
  if (existingSession) {
    console.log(`[AUDIO] Cleaning up existing session for guild ${guildId}`);
    for (const stream of existingSession.streams.values()) {
      if (!stream.destroyed) {
        stream.end();
      }
    }
    for (const proc of existingSession.ffmpegProcesses.values()) {
      try {
        proc.kill();
      } catch (e) {}
    }
    activeSessions.delete(guildId);
  }

  const session: RecordingSession = {
    channelId,
    guildId,
    startTime: new Date(),
    streams: new Map(),
    userFiles: [],
    subscriptions: new Map(),
    ffmpegProcesses: new Map(),
  };

  activeSessions.set(guildId, session);

  // Ensure temp directory exists
  if (!existsSync(CONFIG.TEMP_DIR)) {
    mkdirSync(CONFIG.TEMP_DIR, { recursive: true });
  }

  const receiver = connection.receiver;
  console.log(`[AUDIO] Receiver ready for channel ${channelId}`);

  // Subscribe to speaking events
  receiver.speaking.on("start", (userId) => {
    console.log(`[AUDIO] Speaking event: User ${userId} started speaking`);

    if (session.subscriptions.has(userId)) {
      console.log(`[AUDIO] Already subscribed to user ${userId}`);
      return;
    }

    try {
      const filename = `${CONFIG.TEMP_DIR}/user-${userId}-${timestamp}.pcm`;
      console.log(`[AUDIO] Creating file: ${filename}`);

      // Subscribe to user's audio stream
      const opusStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.Manual,
        },
      });

      session.subscriptions.set(userId, opusStream);

      // Create output file stream for raw PCM data
      const outputStream = createWriteStream(filename);
      session.streams.set(userId, outputStream);
      session.userFiles.push(filename);

      // Track data received
      let bytesReceived = 0;

      opusStream.on("data", (chunk: Buffer) => {
        bytesReceived += chunk.length;
        // Write raw opus data to file
        outputStream.write(chunk);
      });

      opusStream.on("error", (err) => {
        console.error(`[AUDIO] Stream error for ${userId}:`, err.message);
      });

      opusStream.on("end", () => {
        console.log(
          `[AUDIO] Stream ended for ${userId}, received ${bytesReceived} bytes`
        );
        outputStream.end();
      });

      console.log(`[AUDIO] Started recording user ${userId}`);
    } catch (error) {
      console.error(`[AUDIO] Error setting up recording for ${userId}:`, error);
    }
  });

  receiver.speaking.on("end", (userId) => {
    console.log(`[AUDIO] User ${userId} stopped speaking`);
  });

  console.log(`[AUDIO] Recording session started for channel ${channelId}`);
}

export async function stopRecording(guildId: string): Promise<string[] | null> {
  const session = activeSessions.get(guildId);

  if (!session) {
    console.log(`[AUDIO] No active session for guild ${guildId}`);
    return null;
  }

  console.log(`[AUDIO] Stopping recording for guild ${guildId}`);

  // End all subscriptions first
  for (const [userId, subscription] of session.subscriptions.entries()) {
    try {
      subscription.destroy();
      console.log(`[AUDIO] Destroyed subscription for user ${userId}`);
    } catch (e) {
      // Ignore
    }
  }

  // Close file streams
  for (const [userId, stream] of session.streams.entries()) {
    if (!stream.destroyed) {
      stream.end();
      console.log(`[AUDIO] Closed stream for user ${userId}`);
    }
  }

  // Give streams time to flush
  await new Promise((resolve) => setTimeout(resolve, 1000));

  session.streams.clear();
  session.subscriptions.clear();
  session.ffmpegProcesses.clear();

  const duration = Date.now() - session.startTime.getTime();
  console.log(`[AUDIO] Recording duration: ${Math.round(duration / 1000)}s`);

  // Convert PCM files to WAV and check sizes
  const wavFiles: string[] = [];
  for (const pcmFile of session.userFiles) {
    if (!existsSync(pcmFile)) continue;

    const stats = statSync(pcmFile);
    console.log(`[AUDIO] PCM file ${pcmFile}: ${stats.size} bytes`);

    if (stats.size < 100) {
      console.log(`[AUDIO] Skipping empty file: ${pcmFile}`);
      continue;
    }

    // Convert PCM/Opus to WAV using ffmpeg
    const wavFile = pcmFile.replace(/\.pcm$/, ".wav");
    try {
      // Try to decode as opus first
      const ffmpegCmd = `"${FFMPEG}" -y -f s16le -ar 48000 -ac 2 -i "${pcmFile.replace(
        /\\/g,
        "/"
      )}" "${wavFile.replace(/\\/g, "/")}"`;
      console.log(`[AUDIO] Converting: ${pcmFile} -> ${wavFile}`);
      await execAsync(ffmpegCmd);

      if (existsSync(wavFile)) {
        const wavStats = statSync(wavFile);
        console.log(`[AUDIO] WAV file created: ${wavStats.size} bytes`);
        if (wavStats.size > 1000) {
          wavFiles.push(wavFile);
        }
      }
    } catch (error) {
      console.error(`[AUDIO] Failed to convert ${pcmFile}:`, error);
    }
  }

  activeSessions.delete(guildId);

  return wavFiles.length > 0 ? wavFiles : null;
}

export function cleanupRecording(filePaths: string[]): void {
  // Debug mode: keeping files
  console.log(`[DEBUG] Skipping cleanup of ${filePaths.length} files`);
  /*
  for (const filePath of filePaths) {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log(`[AUDIO] Deleted: ${filePath}`);
      }
      // Also try to delete associated PCM file
      const pcmPath = filePath.replace(/\.(wav|mp3|ogg)$/, ".pcm");
      if (existsSync(pcmPath)) {
        unlinkSync(pcmPath);
        console.log(`[AUDIO] Deleted: ${pcmPath}`);
      }
    } catch (error) {
      console.error(`[AUDIO] Failed to delete ${filePath}:`, error);
    }
  }
  */
}

export function getActiveSession(
  guildId: string
): RecordingSession | undefined {
  return activeSessions.get(guildId);
}

/**
 * Merge multiple audio files into a single file
 */
export async function mergeAudioFiles(
  inputFiles: string[],
  guildId: string
): Promise<string | null> {
  const validFiles = inputFiles.filter((f) => {
    if (!existsSync(f)) return false;
    const stats = statSync(f);
    return stats.size > 1000;
  });

  if (validFiles.length === 0) {
    console.log("[AUDIO] No valid audio files to merge");
    return null;
  }

  if (validFiles.length === 1) {
    console.log("[AUDIO] Only one file, skipping merge");
    return validFiles[0];
  }

  try {
    const timestamp = Date.now();
    const outputFile = `${CONFIG.TEMP_DIR}/meeting-${guildId}-${timestamp}.wav`;

    // Use ffmpeg amerge to mix audio tracks
    const inputs = validFiles
      .map((f) => `-i "${f.replace(/\\/g, "/")}"`)
      .join(" ");
    const ffmpegCmd = `"${FFMPEG}" -y ${inputs} -filter_complex "amix=inputs=${
      validFiles.length
    }:duration=longest:dropout_transition=0" -acodec pcm_s16le "${outputFile.replace(
      /\\/g,
      "/"
    )}"`;

    console.log(`[AUDIO] Merging ${validFiles.length} audio files...`);
    await execAsync(ffmpegCmd);

    console.log(`[AUDIO] Merged audio: ${outputFile}`);
    return outputFile;
  } catch (error) {
    console.error("[AUDIO] Error merging audio files:", error);
    return validFiles[0];
  }
}

/**
 * Convert audio file to MP3 format
 */
export async function convertToMp3(
  audioFilePath: string
): Promise<string | null> {
  if (!existsSync(audioFilePath)) {
    console.error(`[AUDIO] File not found: ${audioFilePath}`);
    return null;
  }

  try {
    const mp3FilePath = audioFilePath.replace(/\.(wav|ogg|pcm)$/, ".mp3");

    const ffmpegCmd = `"${FFMPEG}" -y -i "${audioFilePath.replace(
      /\\/g,
      "/"
    )}" -codec:a libmp3lame -qscale:a 2 "${mp3FilePath.replace(/\\/g, "/")}"`;

    console.log("[AUDIO] Converting to MP3...");
    await execAsync(ffmpegCmd);

    console.log(`[AUDIO] MP3 created: ${mp3FilePath}`);
    return mp3FilePath;
  } catch (error) {
    console.error("[AUDIO] Error converting to MP3:", error);
    return null;
  }
}
