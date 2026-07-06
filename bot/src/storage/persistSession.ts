import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  /** Mixed meeting recording as WAV bytes, or null when no audio was captured. */
  audioWav: Buffer | null;
  /** Assembled "Speaker: text" transcript. */
  transcriptText: string;
  summary: SummaryResult;
}

interface Artifact {
  kind: DriveLinkKind;
  label: string;
  fileName: string;
  mimeType: string;
  /** null skips this artifact (e.g. no audio captured). */
  content: Buffer | string | null;
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
 * embed. Files are staged in a temp directory and streamed up, then the temp
 * directory is always removed — so nothing lingers on disk after the upload.
 *
 * Best-effort per artifact: if one upload fails the others still go through, and
 * a total failure (e.g. folder creation) is logged and yields no links rather
 * than derailing summary delivery.
 */
export async function persistSessionToDrive(
  drive: DriveService,
  artifacts: SessionArtifacts,
): Promise<PersistedLink[]> {
  const specs: Artifact[] = [
    { kind: "audio", label: "Audio", fileName: "recording.wav", mimeType: "audio/wav", content: artifacts.audioWav },
    { kind: "transcript", label: "Transcript", fileName: "transcript.txt", mimeType: "text/plain", content: artifacts.transcriptText },
    { kind: "summary", label: "Summary", fileName: "summary.md", mimeType: "text/markdown", content: renderSummary(artifacts.summary) },
  ];

  const dir = await mkdtemp(join(tmpdir(), `scribe-${artifacts.sessionId}-`));
  try {
    const folderId = await drive.ensureFolderPath([artifacts.guildId, artifacts.folderName]);
    const links: PersistedLink[] = [];

    for (const spec of specs) {
      if (spec.content === null) continue;
      const path = join(dir, spec.fileName);
      try {
        await writeFile(path, spec.content);
        const { webViewLink } = await drive.uploadFile({
          folderId,
          name: spec.fileName,
          mimeType: spec.mimeType,
          data: createReadStream(path),
        });
        driveLinks.add({ sessionId: artifacts.sessionId, kind: spec.kind, url: webViewLink });
        links.push({ label: spec.label, url: webViewLink });
      } catch (err) {
        log.error(`failed to upload ${spec.kind} for ${artifacts.sessionId}:`, err);
      }
    }

    return links;
  } catch (err) {
    log.error(`Drive upload failed for session ${artifacts.sessionId}:`, err);
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
