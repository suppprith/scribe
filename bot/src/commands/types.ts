import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

/** The shape a slash-command builder exposes that the registry needs. */
export interface CommandData {
  readonly name: string;
  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

/** A slash command: its definition plus a handler. */
export interface Command {
  data: CommandData;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
