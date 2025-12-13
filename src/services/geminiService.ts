import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, statSync, existsSync } from "node:fs";
import { CONFIG, PROMPTS } from "../utils/constants";
import path from "node:path";

const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".m4a": "audio/mp4",
  };
  return mimeTypes[ext] || "audio/wav";
}

export async function generateSummary(
  audioFilePaths: string[]
): Promise<string | null> {
  if (!audioFilePaths || audioFilePaths.length === 0) {
    console.log("[GEMINI] No audio files to process");
    return null;
  }

  console.log(`[GEMINI] Processing ${audioFilePaths.length} audio files`);

  try {
    const model = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });

    const filePath = audioFilePaths[0];

    if (!existsSync(filePath)) {
      console.error(`[GEMINI] Audio file not found: ${filePath}`);
      return null;
    }

    const fileStats = statSync(filePath);
    const fileSizeInMB = fileStats.size / (1024 * 1024);

    console.log(`[GEMINI] Audio file: ${filePath}`);
    console.log(`[GEMINI] Audio file size: ${fileSizeInMB.toFixed(2)} MB`);

    if (fileSizeInMB < 0.001) {
      console.log("[GEMINI] Audio file too small, likely no content");
      return "No meaningful conversation detected in this recording.";
    }

    if (fileSizeInMB > 20) {
      console.log("[GEMINI] Audio file too large (max 20MB)");
      return "Recording too long to process. Please keep meetings under 30 minutes.";
    }

    const fileBuffer = readFileSync(filePath);
    const base64Audio = fileBuffer.toString("base64");
    const mimeType = getMimeType(filePath);

    console.log(`[GEMINI] Using MIME type: ${mimeType}`);

    const audioPart = {
      inlineData: {
        data: base64Audio,
        mimeType: mimeType,
      },
    };

    console.log("[GEMINI] Sending to Gemini API...");
    const result = await model.generateContent([
      PROMPTS.MEETING_SUMMARY,
      audioPart,
    ]);

    const response = result.response;
    const summary = response.text();

    console.log(`[GEMINI] Generated summary (${summary.length} characters)`);

    return summary;
  } catch (error) {
    console.error("[GEMINI] Failed to generate summary:", error);
    return null;
  }
}

export async function generateSummaryWithRetry(
  audioFilePaths: string[],
  maxRetries: number = 3
): Promise<string | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[GEMINI] Attempt ${attempt}/${maxRetries}`);
      const summary = await generateSummary(audioFilePaths);
      return summary;
    } catch (error) {
      lastError = error as Error;
      console.error(`[GEMINI] Attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[GEMINI] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[GEMINI] All ${maxRetries} attempts failed:`, lastError);
  return null;
}
