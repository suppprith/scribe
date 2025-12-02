export const CONFIG = {
  TARGET_USER_ID: process.env.TARGET_USER_ID || "",
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "",
  MEETING_NOTES_CHANNEL_ID: process.env.MEETING_NOTES_CHANNEL_ID || "",
  PORT: parseInt(process.env.PORT || "3000", 10),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: "gemini-2.5-flash",
  AUDIO_SAMPLE_RATE: 48000,
  AUDIO_CHANNELS: 2,
  MAX_RECORDING_DURATION_MS: 9 * 60 * 60 * 1000,
  TEMP_DIR: "/tmp",
} as const;

export const PROMPTS = {
  MEETING_SUMMARY: `
Listen to this meeting audio. 
Output ONLY a Markdown summary.

## Meeting Agenda
(Infer the agenda based on conversation)

## Key Insights
(Bullet points of important points)

## Action Items
(Tasks with assignees if mentioned)

## Detailed Summary
(Cohesive paragraph summarizing the meeting)

Do NOT provide a transcript.
  `.trim(),
} as const;
