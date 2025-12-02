import { Hono } from "hono";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { CONFIG } from "./utils/constants";
import {
  handleVoiceStateUpdate,
  cleanupAllConnections,
} from "./events/voiceState";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    status: "online",
    bot: "Scribe v1.0",
    message: "Bot is listening...",
    timestamp: new Date().toISOString(),
  });
});

app.get("/status", (c) => {
  const botStatus = client.user
    ? {
        username: client.user.tag,
        id: client.user.id,
        ready: client.isReady(),
      }
    : {
        ready: false,
      };

  return c.json({
    bot: botStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

export { client };

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Monitoring user: ${CONFIG.TARGET_USER_ID}`);
  console.log(`Ready`);
});

client.on(Events.Error, (error) => {
  console.error("Client error:", error);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  await handleVoiceStateUpdate(oldState, newState);
});

client.login(CONFIG.DISCORD_TOKEN).catch((error) => {
  console.error("Login failed:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  cleanupAllConnections();
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  cleanupAllConnections();
  client.destroy();
  process.exit(0);
});

console.log(`Starting server on port ${CONFIG.PORT}`);

export default {
  port: CONFIG.PORT,
  fetch: app.fetch,
};
