import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { initDb } from "./db";

// Config is validated on import; bring up the data layer before Discord.
initDb();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[scribe] bot online as ${c.user.tag}`);
});

await client.login(config.discordToken);
