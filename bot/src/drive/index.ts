import { config } from "../config";
import { createDriveClient } from "./client";
import { DriveService } from "./service";

export { createDriveClient } from "./client";
export { DriveService } from "./service";
export type { UploadResult } from "./service";

/**
 * The Drive service for the bot, or null when Drive isn't configured. Callers
 * treat a null result as "storage disabled" and skip uploads — keeping Drive an
 * optional feature rather than a hard dependency.
 */
export function createDriveService(): DriveService | null {
  const client = createDriveClient();
  if (!client) return null;
  return new DriveService(client, config.googleDrive.folderId);
}
