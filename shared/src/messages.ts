import type { Caption } from "./caption";
import type { Participant, Session } from "./session";

/**
 * Messages the bot's WebSocket server pushes to subscribed web clients. A
 * discriminated union on `type` so the client can switch exhaustively.
 */
export type ServerMessage =
  | { type: "session_start"; session: Session }
  | { type: "session_end"; sessionId: string }
  | { type: "participant_update"; sessionId: string; participants: Participant[] }
  | { type: "caption"; caption: Caption }
  | { type: "summary_ready"; sessionId: string; markdown: string };

/** Messages a client sends to the bot's WebSocket server. */
export type ClientMessage =
  | { type: "subscribe"; sessionId: string }
  | { type: "unsubscribe"; sessionId: string };
