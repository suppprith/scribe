"use client";

/**
 * `useSocket` — a small, reconnecting client for the bot's caption WebSocket.
 *
 * It connects to `${WS_URL}/ws`, optionally auto-subscribing to a session via
 * the `?session=` query param, tracks a live connection `status`, and surfaces
 * every parsed `ServerMessage`. Reconnects with capped exponential backoff.
 * Consumers (e.g. the live-captions view) accumulate messages themselves.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@scribe/shared";
import { WS_TOKEN, WS_URL } from "./env";

export type ConnectionStatus = "connecting" | "open" | "closed";

interface UseSocketOptions {
  /** Session to auto-subscribe to. Changing it reconnects to the new room. */
  sessionId?: string;
  /** Set false to keep the socket closed (e.g. before a session is chosen). */
  enabled?: boolean;
  /** Called for every message pushed by the server. */
  onMessage?: (message: ServerMessage) => void;
}

interface UseSocket {
  status: ConnectionStatus;
  /** The most recent server message, for consumers that only need the latest. */
  lastMessage: ServerMessage | null;
  /** Send a message to the server; no-op while the socket is not open. */
  send: (message: ClientMessage) => void;
}

const MAX_BACKOFF_MS = 10_000;

function buildUrl(sessionId?: string): string {
  const url = new URL("/ws", WS_URL);
  if (sessionId) url.searchParams.set("session", sessionId);
  if (WS_TOKEN) url.searchParams.set("token", WS_TOKEN);
  return url.toString();
}

export function useSocket(options: UseSocketOptions = {}): UseSocket {
  const { sessionId, enabled = true, onMessage } = options;

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) {
      setStatus("closed");
      return;
    }

    let disposed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");

      const ws = new WebSocket(buildUrl(sessionId));
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
      };

      ws.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data as string) as ServerMessage;
        } catch {
          return;
        }
        setLastMessage(message);
        onMessageRef.current?.(message);
      };

      ws.onclose = () => {
        socketRef.current = null;
        if (disposed) return;
        setStatus("connecting");
        const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      // `onerror` fires just before `onclose`; let `onclose` drive reconnect.
      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = socketRef.current;
      socketRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [sessionId, enabled]);

  const send = useCallback((message: ClientMessage) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  return { status, lastMessage, send };
}
