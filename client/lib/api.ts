/**
 * Typed client for the bot's HTTP API. The client is a thin consumer: it holds
 * no business logic, just fetch wrappers that return shared DTOs.
 *
 * Today the bot exposes only `/health` (served by the WS server); the session,
 * transcript, and summary endpoints land with later Phase 4 tickets and slot in
 * here as new methods returning `@scribe/shared` types.
 */
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
    res = await fetch(`${API_URL}${path}`, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  } catch (cause) {
    throw new ApiError(`Cannot reach bot API at ${API_URL}`, undefined);
  }
  if (!res.ok) throw new ApiError(`GET ${path} failed`, res.status);
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
};
