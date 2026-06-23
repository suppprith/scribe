import { joinVoiceChannel } from "@discordjs/voice";
import type { Client } from "discord.js";
import { type CaptureReceiver, type CapturedSegment, SessionCapture } from "./capture";
import type { VoiceGateway } from "./sessionManager";

/** A captured utterance tagged with the session it belongs to. */
export interface CapturedSegmentWithSession extends CapturedSegment {
  sessionId: string;
}

export interface DiscordVoiceGatewayDeps {
  client: Client;
  /** Receives every captured utterance, tagged with its session. */
  onSegment: (segment: CapturedSegmentWithSession) => void;
}

/**
 * The real voice gateway, backed by @discordjs/voice. On join it connects with
 * `selfDeaf: false` (so audio is received) and starts per-speaker capture;
 * `destroy()` stops capture and tears down the connection.
 */
export function createDiscordVoiceGateway(deps: DiscordVoiceGatewayDeps): VoiceGateway {
  return {
    join({ sessionId, guildId, channelId, adapterCreator }) {
      const connection = joinVoiceChannel({
        guildId,
        channelId,
        adapterCreator,
        selfDeaf: false,
        selfMute: true,
      });

      const capture = new SessionCapture({
        receiver: connection.receiver as unknown as CaptureReceiver,
        resolveUsername: (userId) =>
          deps.client.guilds.cache.get(guildId)?.members.cache.get(userId)?.displayName ?? userId,
        onSegment: (segment) => deps.onSegment({ ...segment, sessionId }),
      });
      capture.start();

      return {
        destroy() {
          capture.stop();
          connection.destroy();
        },
      };
    },
  };
}
