import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { initDb } from "./db";
import { handleInteraction } from "./discord/interactions";
import { registerCommands } from "./discord/registerCommands";

// Config is validated on import; bring up the data layer before Discord.
initDb();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`[scribe] bot online as ${c.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, handleInteraction);

await client.login(config.discordToken);
