import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import type { Recording } from "../audio";
import { driveLinks, type DriveLinkKind } from "../db";
import type { DriveService } from "../drive";
import { createLogger } from "../log";
import type { SummaryResult } from "../summary/types";

const log = createLogger("scribe.drive");

/** A link surfaced to the Discord embed after a successful upload. */
export interface PersistedLink {
  label: string;
  url: string;
}

export interface SessionArtifacts {
  guildId: string;
  sessionId: string;
  /** Human-readable Drive folder name for this session (under the guild folder). */
  folderName: string;
  /** Encoded meeting recording on disk, or null when no audio was captured. */
  audio: Recording | null;
  /** Assembled "Speaker: text" transcript. */
  transcriptText: string;
  summary: SummaryResult;
}

/** Render the structured summary as a readable Markdown document. */
function renderSummary(s: SummaryResult): string {
  const section = (title: string, items: string[]): string =>
    items.length ? `\n## ${title}\n${items.map((i) => `- ${i}`).join("\n")}\n` : "";

  return (
    `# Meeting summary\n\n${s.prose || s.overview}\n` +
    section("Topics", s.topics) +
    section("Decisions", s.decisions) +
    section("Action items", s.action_items) +
    section("Highlights", s.highlights) +
    (s.keywords.length ? `\n**Keywords:** ${s.keywords.join(", ")}\n` : "")
  );
}

/**
 * Upload a session's recording, transcript, and summary to Drive, persist the
 * resulting shareable links in `drive_links`, and return them for the Discord
 * embed. Text artifacts are staged in a temp directory and streamed up; the
 * recording is already an Ogg Opus file on disk and is streamed directly. Every
 * temp file — staging dir and the recording — is removed afterward.
 *
 * Best-effort per artifact: if one upload fails the others still go through, and
 * a total failure (e.g. folder creation) is logged and yields no links rather
 * than derailing summary delivery.
 */
export async function persistSessionToDrive(
  drive: DriveService,
  artifacts: SessionArtifacts,
): Promise<PersistedLink[]> {
  const dir = await mkdtemp(join(tmpdir(), `scribe-${artifacts.sessionId}-`));
  try {
    const folderId = await drive.ensureFolderPath([artifacts.guildId, artifacts.folderName]);
    const links: PersistedLink[] = [];

    const upload = async (
      kind: DriveLinkKind,
      label: string,
      fileName: string,
      mimeType: string,
      data: Readable,
    ): Promise<void> => {
      try {
        const { webViewLink } = await drive.uploadFile({ folderId, name: fileName, mimeType, data });
        driveLinks.add({ sessionId: artifacts.sessionId, kind, url: webViewLink });
        links.push({ label, url: webViewLink });
      } catch (err) {
        log.error(`failed to upload ${kind} for ${artifacts.sessionId}:`, err);
      }
    };

    // The recording is already encoded on disk — stream it straight up.
    if (artifacts.audio) {
      await upload("audio", "Audio", artifacts.audio.fileName, artifacts.audio.mimeType, createReadStream(artifacts.audio.path));
    }

    // Text artifacts: write to the staging dir, then stream up.
    const textArtifacts: { kind: DriveLinkKind; label: string; fileName: string; mimeType: string; content: string }[] = [
      { kind: "transcript", label: "Transcript", fileName: "transcript.txt", mimeType: "text/plain", content: artifacts.transcriptText },
      { kind: "summary", label: "Summary", fileName: "summary.md", mimeType: "text/markdown", content: renderSummary(artifacts.summary) },
    ];
    for (const spec of textArtifacts) {
      const path = join(dir, spec.fileName);
      await writeFile(path, spec.content);
      await upload(spec.kind, spec.label, spec.fileName, spec.mimeType, createReadStream(path));
    }

    return links;
  } catch (err) {
    log.error(`Drive upload failed for session ${artifacts.sessionId}:`, err);
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    if (artifacts.audio) await rm(artifacts.audio.path, { force: true }).catch(() => {});
  }
}
