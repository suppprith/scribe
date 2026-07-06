/**
 * Seed a realistic, ended demo session into the bot's SQLite database so the
 * web app can be demoed without a live Discord call: session history, a
 * per-speaker transcript (including a translated turn), and a full summary.
 *
 * Run from bot/:   bun run seed:demo        (or: bun scripts/seed-demo.ts)
 *
 * Uses DB_PATH (default ./data/scribe.db) — the same database the bot serves
 * the web client from. Re-running replaces the previous demo session. The bot
 * doesn't need to be running (but it's fine if it is; restart it to be safe
 * with WAL visibility). No Discord credentials are required.
 */
import { Database } from "bun:sqlite";
import { migrate } from "../src/db/schema";

const DB_PATH = process.env.DB_PATH?.trim() || "./data/scribe.db";
const SESSION_ID = "demo-session-0001";
const GUILD_ID = "000000000000000001";
const CHANNEL_ID = "000000000000000002";

const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
migrate(db);

// Re-runnable: wipe the previous demo session (children cascade).
db.query(`DELETE FROM sessions WHERE id = ?`).run(SESSION_ID);

// A ~14-minute meeting that ended about an hour ago.
const startedAt = Date.now() - 75 * 60_000;
const endedAt = startedAt + 14 * 60_000;

interface Speaker {
  id: string;
  name: string;
}
const ana: Speaker = { id: "100000000000000001", name: "Ana" };
const dev: Speaker = { id: "100000000000000002", name: "Dev" };
const mia: Speaker = { id: "100000000000000003", name: "Mia" };

db.query(
  `INSERT INTO sessions (id, guild_id, channel_id, status, started_at, ended_at)
   VALUES (?, ?, ?, 'ended', ?, ?)`,
).run(SESSION_ID, GUILD_ID, CHANNEL_ID, startedAt, endedAt);

for (const [s, joinOffsetMs] of [
  [ana, 0],
  [dev, 20_000],
  [mia, 45_000],
] as const) {
  db.query(
    `INSERT INTO participants (session_id, user_id, username, joined_at, left_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(SESSION_ID, s.id, s.name, startedAt + joinOffsetMs, endedAt);
}

/** [speaker, text, lang?, translation?] — spaced evenly through the meeting. */
const turns: [Speaker, string, string?, string?][] = [
  [ana, "Alright, quick sync on the release. Main topics are the onboarding flow and the billing bug."],
  [dev, "The billing bug first — it only reproduces when a trial expires on the last day of the month."],
  [ana, "Okay. Is the fix contained, or does it touch the invoice generator too?"],
  [dev, "Contained. One date comparison in the proration step. I have a failing test for it now."],
  [mia, "यह बग हमारे तीन ग्राहकों ने भी रिपोर्ट किया था, इसलिए फिक्स जल्दी चाहिए।", "hi", "Three of our customers reported this bug as well, so we need the fix quickly."],
  [ana, "Good context. Decision then — we ship the billing fix in a patch release this week."],
  [dev, "Agreed. I can have it reviewed by Thursday."],
  [ana, "Next, onboarding. Mia, where did the new checklist design land?"],
  [mia, "The design is final. Five steps, and the progress state persists across sessions now."],
  [dev, "Backend is ready for it — the events were already in place from the analytics work."],
  [ana, "Then let's target the onboarding checklist for the next minor release, not the patch."],
  [mia, "One more thing — we should write migration notes for teams still on the old flow."],
  [ana, "Good call. Mia owns the migration notes, Dev owns the billing patch. I'll draft the release announcement."],
  [dev, "Sounds right. Nothing else from me."],
  [ana, "Great — short and productive. Thanks both!"],
];

const insertCaption = db.query(
  `INSERT INTO captions (session_id, user_id, username, text, ts_start, ts_end, is_final, lang, translated_text, translated_to)
   VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
);
const step = Math.floor((endedAt - startedAt - 60_000) / turns.length);
turns.forEach(([speaker, text, lang, translation], i) => {
  const tsStart = startedAt + 30_000 + i * step;
  insertCaption.run(
    SESSION_ID,
    speaker.id,
    speaker.name,
    text,
    tsStart,
    tsStart + Math.min(step - 500, 6_000),
    lang ?? "en",
    translation ?? null,
    translation ? "en" : null,
  );
});

// Assembled transcript (English text for translated turns, like the real pipeline).
const englishText = (t: (typeof turns)[number]) => t[3] ?? t[1];
const fullText = turns.map((t) => `${t[0].name}: ${englishText(t)}`).join("\n");
const perUser: Record<string, string> = {};
for (const t of turns) {
  perUser[t[0].id] = perUser[t[0].id] ? `${perUser[t[0].id]} ${englishText(t)}` : englishText(t);
}
db.query(
  `INSERT INTO transcripts (session_id, full_text, per_user_json) VALUES (?, ?, ?)`,
).run(SESSION_ID, fullText, JSON.stringify(perUser));

// Structured summary in the NLP service's shape.
const summary = {
  overview:
    "The team synced on the upcoming release, prioritizing a customer-reported billing bug for a patch this week and scheduling the redesigned onboarding checklist for the next minor release.",
  topics: ["Billing proration bug", "Onboarding checklist redesign", "Release planning"],
  keywords: ["billing", "patch release", "onboarding", "checklist", "migration notes"],
  decisions: [
    "Ship the billing fix in a patch release this week.",
    "Target the onboarding checklist for the next minor release.",
  ],
  action_items: [
    "Dev: land the billing patch with review by Thursday.",
    "Mia: write migration notes for teams on the old flow.",
    "Ana: draft the release announcement.",
  ],
  highlights: [
    "The billing bug only reproduces when a trial expires on the last day of the month.",
    "Three customers independently reported the billing bug.",
  ],
  prose:
    "The team met to plan the upcoming release. The customer-reported billing bug — a date comparison in the proration step that occurs when a trial expires on the last day of the month — will ship as a patch this week, with review expected by Thursday. The redesigned five-step onboarding checklist is design-final and backend-ready, and is scheduled for the next minor release. Mia will write migration notes for teams on the old flow, and Ana will draft the release announcement.",
};
db.query(
  `INSERT INTO summaries (session_id, structured_json, posted_to_discord) VALUES (?, ?, 1)`,
).run(SESSION_ID, JSON.stringify(summary));

console.log(`Seeded demo session '${SESSION_ID}' into ${DB_PATH}`);
console.log(`  participants: ${[ana, dev, mia].map((s) => s.name).join(", ")}`);
console.log(`  captions: ${turns.length} (one translated turn), transcript + summary stored`);
console.log(`Open the web app → Sessions to see it. Re-run any time to reset it.`);
