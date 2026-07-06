import { Client, Events, GatewayIntentBits } from "discord.js";
import { AudioChunker, ChunkQueue, SessionRecorder } from "./audio";
import { config } from "./config";
import { captions, initDb, sessions, userLanguage } from "./db";
import { handleInteraction } from "./discord/interactions";
import { registerCommands } from "./discord/registerCommands";
import { createDriveService } from "./drive";
import { deliverSummary } from "./summary";
import { TranscriptionWorker, createTranslator, transcribeChunk } from "./transcription";
import { SessionManager, createDiscordVoiceGateway, createVoiceStateHandler } from "./voice";
import { startCaptionServer } from "./ws";
import { startHttpServer } from "./http";

// Config is validated on import; bring up the data layer before Discord.
initDb();

// Realtime transport for live captions to the web client.
const captionServer = startCaptionServer({
  port: config.wsPort,
  authToken: config.wsAuthToken,
});
console.log(`[scribe] WebSocket server listening on :${captionServer.port}`);

// Read-only HTTP API the web client uses for history, transcripts, and summaries.
const httpServer = startHttpServer({ port: config.httpPort, nlpServiceUrl: config.nlpServiceUrl });
console.log(`[scribe] HTTP API listening on :${httpServer.port}`);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Captured utterances → silence-aware WAV chunks → bounded queue → transcription
// worker → ASR → persisted caption + live broadcast.
const chunkQueue = new ChunkQueue(64);
const chunker = new AudioChunker({ onChunk: (chunk) => chunkQueue.enqueue(chunk) });

// Accumulates each session's utterances into one mixed WAV for Drive archival.
const recorder = new SessionRecorder();

// Google Drive storage (OAuth2), or null when credentials aren't configured —
// in which case sessions run exactly as before, just without uploaded artifacts.
const drive = createDriveService();
console.log(`[scribe] Google Drive storage ${drive ? "enabled" : "disabled (not configured)"}`);

// Cached translator over the NLP service: Hindi/Thai turns → English.
const translator = createTranslator(config.nlpServiceUrl);

const transcriptionWorker = new TranscriptionWorker({
  queue: chunkQueue,
  transcribe: (wav, language) => transcribeChunk(config.nlpServiceUrl, wav, { language }),
  // Route each chunk to ASR with the speaker's configured language (looked up
  // per chunk so a mid-session /scribe lang change applies immediately). `auto`
  // (or an unknown session) falls back to Whisper detection.
  resolveLanguage: (chunk) => {
    const session = sessions.get(chunk.sessionId);
    if (!session) return undefined;
    const lang = userLanguage.get(session.guild_id, chunk.userId);
    return lang === "auto" ? undefined : lang;
  },
  // Attach an English translation to non-English finals (src → en).
  translate: async (text, srcLang) => {
    const r = await translator(text, srcLang, "en");
    return r ? { text: r.translatedText, to: r.tgt } : null;
  },
  onCaption: (caption) => {
    // Only finals are persisted; the live broadcast carries the same caption
    // (original text + any English translation).
    captions.insert({
      sessionId: caption.sessionId,
      userId: caption.userId,
      username: caption.username,
      text: caption.text,
      tsStart: caption.tsStart,
      tsEnd: caption.tsEnd,
      isFinal: caption.isFinal,
      lang: caption.lang,
      translatedText: caption.translatedText,
      translatedTo: caption.translatedTo,
    });
    captionServer.broadcast({ type: "caption", caption });
  },
});
transcriptionWorker.start();

const sessionManager = new SessionManager({
  gateway: createDiscordVoiceGateway({
    client,
    onSegment: (segment) => {
      chunker.push(segment); // → live transcription
      recorder.add(segment); // → archived recording
    },
  }),
  onSessionEnd: (info) => {
    captionServer.broadcast({ type: "session_end", sessionId: info.sessionId });
    // Assemble transcript → summarize → upload to Drive → post to Discord (fire-and-forget).
    void deliverSummary(
      {
        client,
        nlpServiceUrl: config.nlpServiceUrl,
        broadcast: (m) => captionServer.broadcast(m),
        drive,
        recorder,
      },
      info.sessionId,
    );
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
    httpServer.stop();
    await client.destroy();
  } finally {
    process.exit(0);
  }
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await client.login(config.discordToken);
