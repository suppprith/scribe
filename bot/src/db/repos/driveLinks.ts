import { q } from "../client";

export type DriveLinkKind = "audio" | "transcript" | "summary";

export interface DriveLinkRow {
  id: number;
  session_id: string;
  kind: DriveLinkKind;
  url: string;
}

export const driveLinks = {
  add(input: { sessionId: string; kind: DriveLinkKind; url: string }): DriveLinkRow {
    return q<DriveLinkRow>(
      `INSERT INTO drive_links (session_id, kind, url) VALUES (?, ?, ?) RETURNING *`,
    ).get(input.sessionId, input.kind, input.url)!;
  },

  listBySession(sessionId: string): DriveLinkRow[] {
    return q<DriveLinkRow>(
      `SELECT * FROM drive_links WHERE session_id = ? ORDER BY id`,
    ).all(sessionId);
  },
};
