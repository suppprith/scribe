import { Client, Events, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_TOKEN;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[scribe] bot online as ${c.user.tag}`);
});

if (!token) {
  console.warn(
    "[scribe] DISCORD_TOKEN is not set. Copy bot/.env.example to bot/.env and fill it in.",
  );
  process.exit(0);
}

await client.login(token);
