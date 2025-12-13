import { google } from "googleapis";
import { createReadStream, statSync, existsSync } from "node:fs";
import { CONFIG } from "../utils/constants";
import path from "node:path";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

/**
 * Get authenticated Google Drive client using service account credentials
 */
function getAuthClient() {
  if (!CONFIG.GOOGLE_SERVICE_ACCOUNT_EMAIL || !CONFIG.GOOGLE_PRIVATE_KEY) {
    console.error("Google Drive credentials not configured");
    return null;
  }

  const auth = new google.auth.JWT({
    email: CONFIG.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: CONFIG.GOOGLE_PRIVATE_KEY,
    scopes: SCOPES,
  });

  return auth;
}

/**
 * Upload a file to Google Drive and return the shareable link
 */
export async function uploadToGoogleDrive(
  filePath: string,
  fileName?: string
): Promise<{ fileId: string; webViewLink: string } | null> {
  try {
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return null;
    }

    const auth = getAuthClient();
    if (!auth) {
      console.error("Failed to authenticate with Google Drive");
      return null;
    }

    const drive = google.drive({ version: "v3", auth });

    const fileStats = statSync(filePath);
    const fileSizeInMB = fileStats.size / (1024 * 1024);

    console.log(
      `[DRIVE] Uploading to folder: ${CONFIG.GOOGLE_DRIVE_FOLDER_ID}`
    );
    console.log(
      `[DRIVE] Service Account: ${CONFIG.GOOGLE_SERVICE_ACCOUNT_EMAIL}`
    );
    console.log(`[DRIVE] File: ${filePath} (${fileSizeInMB.toFixed(2)} MB)`);

    const finalFileName = fileName || path.basename(filePath);

    const fileMetadata = {
      name: finalFileName,
      parents: CONFIG.GOOGLE_DRIVE_FOLDER_ID
        ? [CONFIG.GOOGLE_DRIVE_FOLDER_ID]
        : undefined,
    };

    const media = {
      mimeType: "audio/mpeg",
      body: createReadStream(filePath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink",
    });

    const fileId = response.data.id;
    const webViewLink = response.data.webViewLink;

    if (!fileId) {
      console.error("[DRIVE] Failed to get file ID from upload response");
      return null;
    }

    // Make the file accessible via link
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    console.log(`[DRIVE] File uploaded successfully: ${webViewLink}`);

    return {
      fileId,
      webViewLink:
        webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    };
  } catch (error: any) {
    if (error.code === 403) {
      console.error(`\n[DRIVE ERROR] Permission Denied (403)`);
      console.error(
        `1. Check if the folder ID is correct: ${CONFIG.GOOGLE_DRIVE_FOLDER_ID}`
      );
      console.error(
        `2. Ensure you shared the folder with: ${CONFIG.GOOGLE_SERVICE_ACCOUNT_EMAIL}`
      );
      console.error(
        `3. Verify the service account has "Editor" permission on the folder.\n`
      );
    } else {
      console.error("[DRIVE] Failed to upload:", error.message);
    }
    return null;
  }
}

/**
 * Generate a meeting file name with timestamp
 */
export function generateMeetingFileName(): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");
  return `meeting-${dateStr}-${timeStr}.mp3`;
}
