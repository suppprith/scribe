import { PCM16_MONO } from "../voice/resample";

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

/**
 * Wrap raw little-endian PCM in a canonical 44-byte WAV (RIFF) header. Defaults
 * to 16 kHz mono 16-bit — the format faster-whisper accepts directly.
 */
export function encodeWav(pcm: Buffer, format: WavFormat = PCM16_MONO): Buffer {
  const { sampleRate, channels, bitDepth } = format;
  const blockAlign = channels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4); // RIFF chunk size
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  header.writeUInt16LE(1, 20); // audio format: PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}
