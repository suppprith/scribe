import type { ServerMessage } from "@scribe/shared";

// Touching a shared type here proves the cross-workspace import resolves.
const messageTypes: ServerMessage["type"][] = [
  "session_start",
  "caption",
  "participant_update",
  "summary_ready",
  "session_end",
];

export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>scribe</h1>
      <p>Live captions, transcripts, and summaries will appear here.</p>
      <p style={{ opacity: 0.6 }}>Realtime events: {messageTypes.join(", ")}</p>
    </main>
  );
}
