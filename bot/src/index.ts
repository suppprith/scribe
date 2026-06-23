import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[scribe] bot online as ${c.user.tag}`);
});

await client.login(config.discordToken);
