import type { Caption } from "./caption";
import type { Session } from "./session";

/**
 * Messages the bot's WebSocket server pushes to the web client. A discriminated
 * union on `type` so the client can switch exhaustively.
 */
export type ServerMessage =
  | { type: "session:start"; session: Session }
  | { type: "session:end"; sessionId: string }
  | { type: "caption"; caption: Caption }
  | { type: "summary"; sessionId: string; markdown: string };

/** Messages the client may send back to the bot (reserved for later phases). */
export type ClientMessage =
  | { type: "subscribe"; sessionId: string }
  | { type: "unsubscribe"; sessionId: string };
