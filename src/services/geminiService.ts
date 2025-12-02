import { GoogleGenerativeAI } from "@google/generative-ai";
import { CONFIG, PROMPTS } from "../utils/constants";

const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);

export async function generateSummaryFromText(
  transcript: string
): Promise<string | null> {
  if (!transcript || transcript.trim().length === 0) {
    console.log("No transcript to summarize");
    return null;
  }

  console.log(
    `Generating summary from ${transcript.length} character transcript`
  );

  try {
    const model = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });

    const prompt = `${PROMPTS.MEETING_SUMMARY}

Meeting Transcript:
${transcript}`;

    const result = await model.generateContent(prompt);
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
  transcript: string,
  maxRetries: number = 3
): Promise<string | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Summary generation attempt ${attempt}/${maxRetries}`);
      const summary = await generateSummaryFromText(transcript);
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
