/**
 * Typed client for the bot's HTTP API. The client is a thin consumer: it holds
 * no business logic, just fetch wrappers that return shared DTOs.
 */
import type {
  MeetingSummary,
  SessionDetail,
  SessionListItem,
  SessionTranscript,
} from "@scribe/shared";
import { API_URL } from "./env";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(`Cannot reach bot API at ${API_URL}`);
  }
  if (!res.ok) throw new ApiError(`GET ${path} failed (${res.status})`, res.status);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  /** True when the bot API answers `/health`. Never throws. */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** Recent sessions, newest first. */
  listSessions(): Promise<SessionListItem[]> {
    return get<SessionListItem[]>("/api/sessions");
  },

  /** Full detail for one session (metadata + transcript + drive links). */
  getSession(id: string): Promise<SessionDetail> {
    return get<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`);
  },

  /** Assembled transcript for one session. */
  getTranscript(id: string): Promise<SessionTranscript> {
    return get<SessionTranscript>(`/api/sessions/${encodeURIComponent(id)}/transcript`);
  },

  /** Structured summary, or null if one has not been generated yet. */
  async getSummary(id: string): Promise<MeetingSummary | null> {
    try {
      return await get<MeetingSummary>(`/api/sessions/${encodeURIComponent(id)}/summary`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
};
