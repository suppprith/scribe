import { type Interaction, MessageFlags } from "discord.js";
import { commandMap } from "../commands";
import { createLogger } from "../log";

const log = createLogger("scribe.discord");

/** Route an incoming interaction to the matching command's handler. */
export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    log.error(`error handling /${interaction.commandName}:`, err);
    const reply = {
      content: "Something went wrong handling that command.",
      flags: MessageFlags.Ephemeral,
    } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}
