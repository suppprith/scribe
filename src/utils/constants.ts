/**
 * Application constants and configuration
 */

export const CONFIG = {
  // Discord Configuration
  TARGET_USER_ID: process.env.TARGET_USER_ID || "",
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "",
  MEETING_NOTES_CHANNEL_ID: process.env.MEETING_NOTES_CHANNEL_ID || "",

  // Server Configuration
  PORT: parseInt(process.env.PORT || "3000", 10),

  // Gemini Configuration
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: "gemini-2.5-flash",

  // Audio Configuration
  AUDIO_SAMPLE_RATE: 48000,
  AUDIO_CHANNELS: 2,
  MAX_RECORDING_DURATION_MS: 9 * 60 * 60 * 1000, // 9 hours

  // File paths
  TEMP_DIR: "/tmp",
} as const;

export const PROMPTS = {
  MEETING_SUMMARY: `
    Listen to this meeting audio. 
    Output ONLY a Markdown summary.
    Structure:
    ## Meeting Agenda
    (Infer the agenda based on the start of conversation)
    
    ## Key Insights
    (Bullet points of the most important realizations)
    
    ## Action Items
    (Checklist of tasks mentioning who is responsible)
    
    ## Detailed Summary
    (A cohesive paragraph summarizing the flow)
    
    Do NOT provide a transcript.
  `.trim(),
} as const;
