import { VoiceConnection, EndBehaviorType } from "@discordjs/voice";
import {
  createWriteStream,
  existsSync,
  unlinkSync,
  WriteStream,
  writeFileSync,
} from "fs";
import { CONFIG } from "../utils/constants";
import * as prism from "prism-media";
import { pipeline } from "stream";

interface RecordingSession {
  channelId: string;
  guildId: string;
  startTime: Date;
  audioBuffers: Map<string, Buffer[]>;
  recordedUsers: Set<string>;
}

const activeSessions = new Map<string, RecordingSession>();

function createWavHeader(
  dataLength: number,
  sampleRate: number = 48000,
  channels: number = 2
): Buffer {
  const header = Buffer.alloc(44);

  // RIFF header
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);

  // fmt chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
  header.writeUInt16LE(channels * 2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample

  // data chunk
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

export function startRecording(
  connection: VoiceConnection,
  channelId: string,
  guildId: string
): void {
  const session: RecordingSession = {
    channelId,
    guildId,
    startTime: new Date(),
    audioBuffers: new Map(),
    recordedUsers: new Set(),
  };

  activeSessions.set(guildId, session);

  const receiver = connection.receiver;

  receiver.speaking.on("start", (userId) => {
    if (session.audioBuffers.has(userId)) {
      return;
    }

    if (!session.recordedUsers.has(userId)) {
      console.log(`Recording user ${userId}`);
      session.recordedUsers.add(userId);
    }

    session.audioBuffers.set(userId, []);

    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.Manual,
      },
    });

    const decoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });

    opusStream.pipe(decoder);

    decoder.on("data", (chunk: Buffer) => {
      const buffers = session.audioBuffers.get(userId);
      if (buffers) {
        buffers.push(chunk);
      }
    });

    decoder.on("error", (err) => {
      console.error(`Decoder error for user ${userId}:`, err);
    });
  });

  console.log(`Started recording for channel ${channelId}`);
}

export function stopRecording(guildId: string): string[] | null {
  const session = activeSessions.get(guildId);

  if (!session) {
    console.log(`No active session for guild ${guildId}`);
    return null;
  }

  console.log(`Stopping recording for guild ${guildId}`);

  const duration = Date.now() - session.startTime.getTime();
  console.log(`Recording duration: ${Math.round(duration / 1000)}s`);

  const files: string[] = [];

  for (const [userId, buffers] of session.audioBuffers.entries()) {
    if (buffers.length === 0) {
      console.log(`No audio data for user ${userId}`);
      continue;
    }

    const audioData = Buffer.concat(buffers);
    const header = createWavHeader(audioData.length);
    const wavData = Buffer.concat([header, audioData]);

    const filename = `${CONFIG.TEMP_DIR}/user-${userId}-${Date.now()}.wav`;

    try {
      writeFileSync(filename, wavData);
      files.push(filename);
      console.log(
        `Saved WAV file for user ${userId}: ${(
          wavData.length /
          1024 /
          1024
        ).toFixed(2)} MB`
      );
    } catch (error) {
      console.error(`Failed to save audio for user ${userId}:`, error);
    }
  }

  activeSessions.delete(guildId);

  return files.length > 0 ? files : null;
}

export function cleanupRecording(filePaths: string[]): void {
  for (const filePath of filePaths) {
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
        console.log(`Cleaned up: ${filePath}`);
      } catch (error) {
        console.error(`Failed to cleanup ${filePath}:`, error);
      }
    }
  }
}

export function getActiveSession(
  guildId: string
): RecordingSession | undefined {
  return activeSessions.get(guildId);
}
