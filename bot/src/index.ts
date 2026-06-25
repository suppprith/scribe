import { Client, Events, GatewayIntentBits } from "discord.js";
import { AudioChunker, ChunkQueue } from "./audio";
import { config } from "./config";
import { captions, initDb } from "./db";
import { handleInteraction } from "./discord/interactions";
import { registerCommands } from "./discord/registerCommands";
import { TranscriptionWorker, transcribeChunk } from "./transcription";
import { SessionManager, createDiscordVoiceGateway, createVoiceStateHandler } from "./voice";
import { startCaptionServer } from "./ws";

// Config is validated on import; bring up the data layer before Discord.
initDb();

// Realtime transport for live captions to the web client.
const captionServer = startCaptionServer({
  port: config.wsPort,
  authToken: config.wsAuthToken,
});
console.log(`[scribe] WebSocket server listening on :${captionServer.port}`);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Captured utterances → silence-aware WAV chunks → bounded queue → transcription
// worker → ASR → persisted caption + live broadcast.
const chunkQueue = new ChunkQueue(64);
const chunker = new AudioChunker({ onChunk: (chunk) => chunkQueue.enqueue(chunk) });

const transcriptionWorker = new TranscriptionWorker({
  queue: chunkQueue,
  transcribe: (wav, language) => transcribeChunk(config.nlpServiceUrl, wav, { language }),
  onCaption: (caption) => {
    // Only finals are persisted; the live broadcast carries the same caption.
    captions.insert({
      sessionId: caption.sessionId,
      userId: caption.userId,
      username: caption.username,
      text: caption.text,
      tsStart: caption.tsStart,
      tsEnd: caption.tsEnd,
      isFinal: caption.isFinal,
    });
    captionServer.broadcast({ type: "caption", caption });
  },
});
transcriptionWorker.start();

const sessionManager = new SessionManager({
  gateway: createDiscordVoiceGateway({
    client,
    onSegment: (segment) => chunker.push(segment),
  }),
  onSessionEnd: (info) => {
    captionServer.broadcast({ type: "session_end", sessionId: info.sessionId });
    // Phase 5/6: assemble transcript → summarize → deliver to Discord → archive.
    console.log(`[scribe] session ${info.sessionId} ready for the end-of-session pipeline`);
  },
});

client.once(Events.ClientReady, async (c) => {
  console.log(`[scribe] bot online as ${c.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, handleInteraction);
client.on(Events.VoiceStateUpdate, createVoiceStateHandler(sessionManager));

// Graceful shutdown: end every active session and disconnect cleanly.
const shutdown = async (signal: NodeJS.Signals) => {
  console.log(`[scribe] ${signal} received — shutting down`);
  try {
    transcriptionWorker.stop();
    sessionManager.endAll();
    captionServer.stop();
    await client.destroy();
  } finally {
    process.exit(0);
  }
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await client.login(config.discordToken);
