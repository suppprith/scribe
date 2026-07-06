import { google, type drive_v3 } from "googleapis";
import { config, type GoogleDriveConfig } from "../config";

/**
 * Build an authenticated Google Drive client from OAuth2 credentials.
 *
 * We use the **OAuth2 refresh-token** flow, not a service account: a service
 * account has no personal Drive storage quota, so it can't upload to a personal
 * "My Drive" (only to a Shared Drive it's a member of). A refresh token minted
 * from the user's own Google account uploads as that user, into their Drive,
 * with no interactive prompt at runtime. See scripts/google-auth.ts for the
 * one-time flow that produces the refresh token.
 *
 * Returns null when Drive isn't configured, so storage stays an optional,
 * best-effort feature — the bot runs fine without it.
 */
export function createDriveClient(cfg: GoogleDriveConfig = config.googleDrive): drive_v3.Drive | null {
  const { clientId, clientSecret, refreshToken } = cfg;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const auth = new google.auth.OAuth2({ clientId, clientSecret });
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth });
}
