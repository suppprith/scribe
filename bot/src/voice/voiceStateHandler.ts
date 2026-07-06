import type { VoiceState } from "discord.js";
import { guildConfig } from "../db";
import type { SessionManager } from "./sessionManager";

function isWatched(guildId: string, channelId: string): boolean {
  return guildConfig.get(guildId)?.watchedVcIds.includes(channelId) ?? false;
}

/**
 * Build a VoiceStateUpdate listener. A channel change is treated as a leave of
 * the old channel followed by a join of the new one, so joins, leaves, and
 * moves all flow through the same path. Only watched channels open sessions;
 * bots (including scribe itself) are ignored.
 */
export function createVoiceStateHandler(manager: SessionManager) {
  return (oldState: VoiceState, newState: VoiceState): void => {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const guildId = newState.guild.id;
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    if (oldChannelId === newChannelId) return; // mute/deafen/etc., not a move

    if (oldChannelId) {
      manager.userLeft({ guildId, channelId: oldChannelId, userId: member.id });
    }

    if (newChannelId && newState.channel && isWatched(guildId, newChannelId)) {
      manager.userJoined({
        guildId,
        channelId: newChannelId,
        userId: member.id,
        username: member.displayName,
        adapterCreator: newState.guild.voiceAdapterCreator,
      });
    }
  };
}
