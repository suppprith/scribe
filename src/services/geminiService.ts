import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, statSync } from "fs";
import { CONFIG, PROMPTS } from "../utils/constants";

const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);

export async function generateSummary(
  audioFilePaths: string[]
): Promise<string | null> {
  if (!audioFilePaths || audioFilePaths.length === 0) {
    console.log("No audio files to process");
    return null;
  }

  console.log(`Processing ${audioFilePaths.length} audio files`);

  try {
    const model = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });

    const filePath = audioFilePaths[0];
    const fileStats = statSync(filePath);
    const fileSizeInMB = fileStats.size / (1024 * 1024);

    console.log(`Audio file size: ${fileSizeInMB.toFixed(2)} MB`);

    const fileBuffer = readFileSync(filePath);
    const base64Audio = fileBuffer.toString("base64");

    const audioPart = {
      inlineData: {
        data: base64Audio,
        mimeType: "audio/pcm",
      },
    };

    const result = await model.generateContent([
      PROMPTS.MEETING_SUMMARY,
      audioPart,
    ]);

    const response = result.response;
    const summary = response.text();

    console.log(`Generated summary (${summary.length} characters)`);

    return summary;
  } catch (error) {
    console.error("Failed to generate summary:", error);
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
      console.log(`Summary generation attempt ${attempt}/${maxRetries}`);
      const summary = await generateSummary(audioFilePaths);
      return summary;
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`All ${maxRetries} attempts failed:`, lastError);
  return null;
}
