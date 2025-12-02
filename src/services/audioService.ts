import { VoiceConnection, EndBehaviorType } from "@discordjs/voice";
import { createWriteStream, existsSync, unlinkSync, WriteStream } from "fs";
import { pipeline } from "stream";
import { CONFIG } from "../utils/constants";

interface RecordingSession {
  channelId: string;
  guildId: string;
  startTime: Date;
  streams: Map<string, WriteStream>;
  userFiles: string[];
}

const activeSessions = new Map<string, RecordingSession>();

export function startRecording(
  connection: VoiceConnection,
  channelId: string,
  guildId: string
): void {
  const timestamp = Date.now();

  const session: RecordingSession = {
    channelId,
    guildId,
    startTime: new Date(),
    streams: new Map(),
    userFiles: [],
  };

  activeSessions.set(guildId, session);

  const receiver = connection.receiver;

  receiver.speaking.on("start", (userId) => {
    if (session.streams.has(userId)) {
      return;
    }

    console.log(`Recording user ${userId}`);

    const audioStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 100,
      },
    });

    const filename = `${CONFIG.TEMP_DIR}/user-${userId}-${timestamp}.pcm`;
    const outputStream = createWriteStream(filename);

    session.userFiles.push(filename);

    pipeline(audioStream, outputStream, (err) => {
      if (err) {
        console.error(`Pipeline error for user ${userId}:`, err);
      }
      session.streams.delete(userId);
    });

    session.streams.set(userId, outputStream);
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

  for (const [userId, stream] of session.streams.entries()) {
    stream.end();
    console.log(`Closed stream for user ${userId}`);
  }

  session.streams.clear();

  const duration = Date.now() - session.startTime.getTime();
  console.log(`Recording duration: ${Math.round(duration / 1000)}s`);

  const files = session.userFiles;
  activeSessions.delete(guildId);

  return files;
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
