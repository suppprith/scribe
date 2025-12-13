import path from "node:path";

export const CONFIG = {
  // Discord Configuration
  TARGET_USER_ID: process.env.TARGET_USER_ID || "",
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "",
  MEETING_NOTES_CHANNEL_ID: process.env.MEETING_NOTES_CHANNEL_ID || "",

  // Server Configuration
  PORT: Number.parseInt(process.env.PORT || "3000", 10),

  // Gemini AI Configuration
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: "gemini-flash-latest",

  // Google Drive Configuration
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
  GOOGLE_PRIVATE_KEY:
    process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "",
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID || "",

  // Audio Configuration
  AUDIO_SAMPLE_RATE: 48000,
  AUDIO_CHANNELS: 2,
  MAX_RECORDING_DURATION_MS: 9 * 60 * 60 * 1000,
  TEMP_DIR: path.join(process.cwd(), "tmp"),
} as const;

export const PROMPTS = {
  MEETING_SUMMARY: `
You are an expert meeting transcription and summarization assistant. 

Listen carefully to this Discord voice channel audio recording. The audio contains a conversation between multiple participants.

Your task:
1. First, transcribe and understand what is being discussed
2. Identify the main topics and key points
3. Extract any action items or decisions made
4. Create a professional meeting summary

IMPORTANT: If the audio is silent, very short (under 10 seconds), or contains no meaningful conversation, respond ONLY with:
"No meaningful conversation detected in this recording."

Otherwise, provide a structured summary in this exact Markdown format:

## Meeting Overview
[1-2 sentence overview of what the meeting was about]

## Key Discussion Points
- [Bullet point 1]
- [Bullet point 2]
- [Add more as needed]

## Decisions Made
- [Decision 1]
- [Decision 2]
- [Write "None" if no decisions were made]

## Action Items
- [ ] [Task description] - @[Person if mentioned]
- [ ] [Task description] - @[Person if mentioned]
- [Write "None" if no action items]

## Additional Notes
[Any other relevant information, questions raised, or topics for future discussion]

---
**Note:** Do NOT include a full transcript. Focus on insights and actionable information.
  `.trim(),
} as const;
