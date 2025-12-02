/**
 * Scribe - Voice Note Assistant
 * Main entry point for the Discord bot and Hono server
 */

import { Hono } from "hono";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { CONFIG } from "./utils/constants";

// Initialize Hono app for health checks and status endpoint
const app = new Hono();

// Health check endpoint
app.get("/", (c) => {
  return c.json({
    status: "online",
    bot: "Scribe v1.0",
    message: "Bot is listening...",
    timestamp: new Date().toISOString(),
  });
});

// Status endpoint
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

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Discord event: Bot is ready
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Discord bot logged in as ${readyClient.user.tag}`);
  console.log(
    `Monitoring voice activity for user ID: ${CONFIG.TARGET_USER_ID}`
  );
  console.log(`Bot is ready to take notes`);
});

// Discord event: Error handling
client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

// Discord event: Voice state updates (will be implemented in next phase)
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // TODO: Implement voice state detection logic
  // For now, just log the event
  if (newState.member?.id === CONFIG.TARGET_USER_ID) {
    if (newState.channelId && !oldState.channelId) {
      console.log(`Target user joined voice channel: ${newState.channelId}`);
      // TODO: Join channel and start recording
    } else if (!newState.channelId && oldState.channelId) {
      console.log(`Target user left voice channel: ${oldState.channelId}`);
      // TODO: Stop recording and process summary
    }
  }
});

// Login to Discord
client.login(CONFIG.DISCORD_TOKEN).catch((error) => {
  console.error("Failed to login to Discord:", error);
  process.exit(1);
});

// Start Hono server
console.log(`Starting Hono server on port ${CONFIG.PORT}...`);

export default {
  port: CONFIG.PORT,
  fetch: app.fetch,
};
