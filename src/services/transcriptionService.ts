import { SpeechClient } from "@google-cloud/speech";
import { readFileSync } from "fs";
import { CONFIG } from "../utils/constants";

const speechClient = new SpeechClient({
  apiKey: CONFIG.GEMINI_API_KEY,
});

export async function transcribeAudio(
  audioFilePaths: string[]
): Promise<string | null> {
  if (!audioFilePaths || audioFilePaths.length === 0) {
    console.log("No audio files to transcribe");
    return null;
  }

  try {
    const transcripts: string[] = [];

    for (const filePath of audioFilePaths) {
      console.log(`Transcribing: ${filePath}`);

      const audioBytes = readFileSync(filePath);

      const request = {
        audio: {
          content: audioBytes.toString("base64"),
        },
        config: {
          encoding: "LINEAR16" as const,
          sampleRateHertz: 48000,
          languageCode: "en-US",
          audioChannelCount: 2,
          enableAutomaticPunctuation: true,
          model: "default",
        },
      };

      const [response] = await speechClient.recognize(request);

      if (response.results && response.results.length > 0) {
        const transcript = response.results
          .map((result: any) => result.alternatives?.[0]?.transcript || "")
          .join(" ");

        if (transcript.trim()) {
          transcripts.push(transcript);
          console.log(`Transcribed ${transcript.length} characters`);
        }
      } else {
        console.log(`No transcription for ${filePath}`);
      }
    }

    if (transcripts.length === 0) {
      console.log("No transcriptions generated");
      return null;
    }

    const fullTranscript = transcripts.join("\n\n");
    console.log(`Total transcript: ${fullTranscript.length} characters`);

    return fullTranscript;
  } catch (error) {
    console.error("Transcription failed:", error);
    return null;
  }
}

export async function transcribeAudioWithRetry(
  audioFilePaths: string[],
  maxRetries: number = 3
): Promise<string | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Transcription attempt ${attempt}/${maxRetries}`);
      const transcript = await transcribeAudio(audioFilePaths);
      return transcript;
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

  console.error(`All ${maxRetries} transcription attempts failed:`, lastError);
  return null;
}
