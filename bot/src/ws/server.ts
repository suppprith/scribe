import type { ServerWebSocket } from "bun";
import type { ClientMessage, Participant, ServerMessage } from "@scribe/shared";

interface WsData {
  sessionId?: string;
}
type WS = ServerWebSocket<WsData>;

function sessionIdOf(message: ServerMessage): string {
  switch (message.type) {
    case "session_start":
      return message.session.id;
    case "caption":
      return message.caption.sessionId;
    default:
      return message.sessionId;
  }
}

/**
 * Per-session pub/sub for live caption events. Clients join one session "room"
 * and receive every ServerMessage broadcast for it. The latest participant
 * roster is cached per session so a (re)subscribing client immediately gets the
 * current participants without waiting for the next change.
 */
class CaptionHub {
  private readonly rooms = new Map<string, Set<WS>>();
  private readonly participants = new Map<string, Participant[]>();

  onOpen(ws: WS): void {
    if (ws.data.sessionId) this.subscribe(ws, ws.data.sessionId);
  }

  onMessage(ws: WS, raw: string | Buffer): void {
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }
    if (message.type === "subscribe") {
      this.subscribe(ws, message.sessionId);
    } else if (message.type === "unsubscribe") {
      this.leaveRoom(ws);
      ws.data.sessionId = undefined;
    }
  }

  onClose(ws: WS): void {
    this.leaveRoom(ws);
  }

  subscribe(ws: WS, sessionId: string): void {
    if (ws.data.sessionId && ws.data.sessionId !== sessionId) this.leaveRoom(ws);
    ws.data.sessionId = sessionId;

    let room = this.rooms.get(sessionId);
    if (!room) {
      room = new Set();
      this.rooms.set(sessionId, room);
    }
    room.add(ws);

    const roster = this.participants.get(sessionId);
    if (roster) {
      ws.send(
        JSON.stringify({ type: "participant_update", sessionId, participants: roster } satisfies ServerMessage),
      );
    }
  }

  broadcast(message: ServerMessage): void {
    const sessionId = sessionIdOf(message);
    if (message.type === "participant_update") {
      this.participants.set(sessionId, message.participants);
    } else if (message.type === "session_end") {
      this.participants.delete(sessionId);
    }

    const room = this.rooms.get(sessionId);
    if (!room || room.size === 0) return;
    const data = JSON.stringify(message);
    for (const ws of room) ws.send(data);
  }

  roomSize(sessionId: string): number {
    return this.rooms.get(sessionId)?.size ?? 0;
  }

  private leaveRoom(ws: WS): void {
    const sessionId = ws.data.sessionId;
    if (!sessionId) return;
    const room = this.rooms.get(sessionId);
    room?.delete(ws);
    if (room && room.size === 0) this.rooms.delete(sessionId);
  }
}

export interface CaptionServer {
  /** Push a message to every client subscribed to its session. */
  broadcast(message: ServerMessage): void;
  /** Number of live subscribers for a session (observability/tests). */
  roomSize(sessionId: string): number;
  readonly port: number;
  stop(): void;
}

/**
 * Start the caption WebSocket server. Clients connect to `ws://host:port/ws`
 * with `?session=<id>` (auto-subscribe) and, if configured, `?token=<token>`.
 * They may also (re)subscribe via a `{ type: "subscribe", sessionId }` message.
 */
export function startCaptionServer(opts: { port: number; authToken?: string }): CaptionServer {
  const hub = new CaptionHub();

  const server = Bun.serve<WsData>({
    port: opts.port,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/health") return new Response("ok");
      if (url.pathname === "/ws") {
        if (opts.authToken && url.searchParams.get("token") !== opts.authToken) {
          return new Response("unauthorized", { status: 401 });
        }
        const sessionId = url.searchParams.get("session") ?? undefined;
        if (srv.upgrade(req, { data: { sessionId } })) return undefined;
        return new Response("upgrade failed", { status: 400 });
      }
      return new Response("not found", { status: 404 });
    },
    websocket: {
      open: (ws) => hub.onOpen(ws),
      message: (ws, msg) => hub.onMessage(ws, msg),
      close: (ws) => hub.onClose(ws),
    },
  });

  return {
    broadcast: (message) => hub.broadcast(message),
    roomSize: (sessionId) => hub.roomSize(sessionId),
    get port() {
      return server.port ?? opts.port;
    },
    stop: () => server.stop(true),
  };
}
