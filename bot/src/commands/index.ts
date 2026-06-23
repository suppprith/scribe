import { scribeCommand } from "./scribe";
import type { Command } from "./types";

/** All slash commands the bot exposes. */
export const commands: Command[] = [scribeCommand];

/** Lookup by command name, for routing interactions. */
export const commandMap = new Map<string, Command>(commands.map((c) => [c.data.name, c]));

export type { Command } from "./types";
