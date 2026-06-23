import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { initDb } from "./db";
import { handleInteraction } from "./discord/interactions";
import { registerCommands } from "./discord/registerCommands";
import { SessionManager, createVoiceStateHandler, discordVoiceGateway } from "./voice";

// Config is validated on import; bring up the data layer before Discord.
initDb();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const sessionManager = new SessionManager({
  gateway: discordVoiceGateway,
  onSessionEnd: (info) => {
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

await client.login(config.discordToken);
