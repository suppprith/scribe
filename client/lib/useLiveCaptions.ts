"use client";

/**
 * `useLiveCaptions` — everything the live view needs for one session, driven by
 * the caption WebSocket.
 *
 * Captions are keyed by `${userId}:${seq}` so a partial (`isFinal: false`) is
 * replaced in place by its corrected final without flicker or duplication. A
 * one-shot HTTP fetch seeds session metadata + participants so joining
 * mid-session shows the right roster immediately; WS updates layer on top.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Caption, Participant, ServerMessage, SessionStatus } from "@scribe/shared";
import { api } from "./api";
import { useSocket, type ConnectionStatus } from "./useSocket";

interface LiveCaptions {
  status: ConnectionStatus;
  sessionStatus: SessionStatus | "unknown";
  startedAt?: number;
  participants: Participant[];
  /** Time-ordered captions (partials merged into finals). */
  captions: Caption[];
}

function keyOf(c: Caption): string {
  return `${c.userId}:${c.seq}`;
}

export function useLiveCaptions(sessionId: string): LiveCaptions {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | "unknown">("unknown");
  const [startedAt, setStartedAt] = useState<number | undefined>();

  // Ordered map preserves insertion order; re-inserting the same key updates in
  // place (a final replacing its partial keeps its original position).
  const captionMap = useRef(new Map<string, Caption>());
  const [captions, setCaptions] = useState<Caption[]>([]);

  const flush = useCallback(() => {
    const list = [...captionMap.current.values()];
    list.sort((a, b) => a.tsStart - b.tsStart || a.seq - b.seq);
    setCaptions(list);
  }, []);

  // Reset all per-session state when the session changes.
  useEffect(() => {
    captionMap.current = new Map();
    setCaptions([]);
    setParticipants([]);
    setSessionStatus("unknown");
    setStartedAt(undefined);

    let alive = true;
    api
      .getSession(sessionId)
      .then((s) => {
        if (!alive) return;
        setParticipants(s.participants);
        setSessionStatus(s.status);
        setStartedAt(s.startedAt);
        for (const line of s.transcript.lines) {
          const c: Caption = {
            sessionId,
            userId: line.userId,
            username: line.username,
            text: line.text,
            tsStart: line.tsStart,
            tsEnd: line.tsEnd,
            isFinal: true,
            // Persisted finals have no stored seq; derive a stable, ordered key.
            seq: line.tsStart,
          };
          captionMap.current.set(keyOf(c), c);
        }
        flush();
      })
      .catch(() => {
        /* No baseline (e.g. brand-new session) — WS will populate. */
      });
    return () => {
      alive = false;
    };
  }, [sessionId, flush]);

  const onMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "session_start":
          if (message.session.id !== sessionId) return;
          setParticipants(message.session.participants);
          setSessionStatus(message.session.status);
          setStartedAt(message.session.startedAt);
          break;
        case "participant_update":
          if (message.sessionId !== sessionId) return;
          setParticipants(message.participants);
          break;
        case "caption":
          if (message.caption.sessionId !== sessionId) return;
          captionMap.current.set(keyOf(message.caption), message.caption);
          flush();
          break;
        case "session_end":
          if (message.sessionId !== sessionId) return;
          setSessionStatus("ended");
          break;
        default:
          break;
      }
    },
    [sessionId, flush],
  );

  const { status } = useSocket({ sessionId, onMessage });

  return useMemo(
    () => ({ status, sessionStatus, startedAt, participants, captions }),
    [status, sessionStatus, startedAt, participants, captions],
  );
}
