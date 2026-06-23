import { joinVoiceChannel } from "@discordjs/voice";
import type { VoiceGateway } from "./sessionManager";

/**
 * The real voice gateway, backed by @discordjs/voice. `selfDeaf: false` so the
 * bot can receive each speaker's audio (per-user capture, SUP-11).
 */
export const discordVoiceGateway: VoiceGateway = {
  join({ guildId, channelId, adapterCreator }) {
    return joinVoiceChannel({
      guildId,
      channelId,
      adapterCreator,
      selfDeaf: false,
      selfMute: true,
    });
  },
};
