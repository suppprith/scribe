import { Readable } from "node:stream";
import type { drive_v3 } from "googleapis";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface UploadResult {
  id: string;
  /** Browser-openable link, shareable to anyone with the URL. */
  webViewLink: string;
}

/**
 * A thin wrapper over the Drive v3 API for the two things scribe needs: laying
 * out a per-server / per-session folder tree, and uploading a file into it with
 * a shareable "anyone with the link" reader permission.
 *
 * Folder lookups are cached per path so a session's three uploads resolve the
 * folder tree once. Instances are cheap; one is created for the bot's lifetime.
 */
export class DriveService {
  private readonly drive: drive_v3.Drive;
  /** Optional root folder id everything is nested under (config.folderId). */
  private readonly rootId?: string;
  /** Cache of "parentId/childName" → child folder id. */
  private readonly folderCache = new Map<string, Promise<string>>();

  constructor(drive: drive_v3.Drive, rootId?: string) {
    this.drive = drive;
    this.rootId = rootId;
  }

  /**
   * Resolve a nested folder path (e.g. ["<guildId>", "<sessionId>"]) under the
   * configured root, creating any segment that doesn't exist. Returns the id of
   * the deepest folder. Concurrent calls for the same path share one lookup.
   */
  async ensureFolderPath(names: string[]): Promise<string> {
    let parent = this.rootId ?? "root";
    for (const name of names) {
      parent = await this.ensureChildFolder(parent, name);
    }
    return parent;
  }

  private ensureChildFolder(parentId: string, name: string): Promise<string> {
    const key = `${parentId}/${name}`;
    const cached = this.folderCache.get(key);
    if (cached) return cached;

    const pending = this.findOrCreateFolder(parentId, name);
    this.folderCache.set(key, pending);
    // Don't cache a failed lookup — let the next attempt retry.
    pending.catch(() => this.folderCache.delete(key));
    return pending;
  }

  private async findOrCreateFolder(parentId: string, name: string): Promise<string> {
    const escaped = name.replace(/'/g, "\\'");
    const res = await this.drive.files.list({
      q: `name = '${escaped}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`,
      fields: "files(id)",
      pageSize: 1,
    });
    const existing = res.data.files?.[0]?.id;
    if (existing) return existing;

    const created = await this.drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: "id",
    });
    const id = created.data.id;
    if (!id) throw new Error(`Drive returned no id for folder "${name}"`);
    return id;
  }

  /**
   * Upload a file into `folderId` and return a shareable link. The file is made
   * readable by anyone with the URL so the Discord embed / web links just work.
   * `data` may be an in-memory Buffer/string or a Readable (e.g. a file stream).
   */
  async uploadFile(input: {
    folderId: string;
    name: string;
    mimeType: string;
    data: Buffer | string | Readable;
  }): Promise<UploadResult> {
    const body = Buffer.isBuffer(input.data) ? Readable.from(input.data) : input.data;
    const created = await this.drive.files.create({
      requestBody: { name: input.name, parents: [input.folderId] },
      media: { mimeType: input.mimeType, body },
      fields: "id, webViewLink",
    });

    const id = created.data.id;
    if (!id) throw new Error(`Drive returned no id for file "${input.name}"`);

    await this.drive.permissions.create({
      fileId: id,
      requestBody: { role: "reader", type: "anyone" },
    });

    // webViewLink is present once the file exists; fall back to a canonical URL.
    const webViewLink = created.data.webViewLink ?? `https://drive.google.com/file/d/${id}/view`;
    return { id, webViewLink };
  }
}
