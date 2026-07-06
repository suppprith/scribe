import { REST, Routes } from "discord.js";
import { commands } from "../commands";
import { config } from "../config";
import { createLogger } from "../log";

const log = createLogger("scribe.discord");

/**
 * Register slash commands with Discord at startup. If DISCORD_DEV_GUILD_ID is
 * set, commands are scoped to that guild (updates apply instantly — ideal for
 * dev); otherwise they are registered globally (can take up to an hour to
 * propagate). Needs DISCORD_CLIENT_ID; without it, registration is skipped.
 */
export async function registerCommands(): Promise<void> {
  if (!config.discordClientId) {
    log.warn("DISCORD_CLIENT_ID is not set — skipping slash-command registration.");
    return;
  }

  const rest = new REST().setToken(config.discordToken);
  const body = commands.map((command) => command.data.toJSON());

  const route = config.discordDevGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordDevGuildId)
    : Routes.applicationCommands(config.discordClientId);

  await rest.put(route, { body });

  const scope = config.discordDevGuildId
    ? `to dev guild ${config.discordDevGuildId}`
    : "globally";
  log.info(`registered ${commands.length} slash command(s) ${scope}.`);
}
