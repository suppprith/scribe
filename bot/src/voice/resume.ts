import type { Client } from "discord.js";
import { guildConfig } from "../db";
import { createLogger } from "../log";
import type { SessionManager } from "./sessionManager";

const log = createLogger("scribe.voice");

/**
 * After a (re)start, voice sessions from the previous process are gone — but
 * people may still be mid-meeting in a watched channel. Scan every guild's
 * watched voice channels and register current occupants with the session
 * manager, which opens fresh sessions for occupied channels exactly as if each
 * user had just joined. Returns the number of users adopted.
 */
export async function resumeWatchedChannels(
  client: Client,
  manager: SessionManager,
): Promise<number> {
  let adopted = 0;

  for (const cfg of guildConfig.all()) {
    const guild =
      client.guilds.cache.get(cfg.guildId) ??
      (await client.guilds.fetch(cfg.guildId).catch(() => null));
    if (!guild) continue;

    for (const channelId of cfg.watchedVcIds) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isVoiceBased()) continue;

      for (const member of channel.members.values()) {
        if (member.user.bot) continue;
        manager.userJoined({
          guildId: guild.id,
          channelId,
          userId: member.id,
          username: member.displayName,
          adapterCreator: guild.voiceAdapterCreator,
        });
        adopted++;
      }
    }
  }

  if (adopted > 0) {
    log.info(`resumed recording for ${adopted} user(s) already in watched channels`);
  }
  return adopted;
}
