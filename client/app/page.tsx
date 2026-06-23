import type { CaptionKind } from "@scribe/shared";

// Touching a shared type here proves the cross-workspace import resolves.
const captionKinds: CaptionKind[] = ["partial", "final"];

export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>scribe</h1>
      <p>Live captions, transcripts, and summaries will appear here.</p>
      <p style={{ opacity: 0.6 }}>Caption kinds: {captionKinds.join(", ")}</p>
    </main>
  );
}
