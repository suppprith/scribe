/**
 * Convert Discord's decoded voice PCM (48 kHz, stereo, signed 16-bit LE) to the
 * 16 kHz mono signed-16-bit-LE PCM that Whisper expects.
 *
 * 48 kHz → 16 kHz is an exact 3× decimation, and stereo → mono averages the two
 * channels. Each group of 3 stereo frames (12 bytes) becomes one mono sample
 * (2 bytes) by averaging. A trailing partial group (< 12 bytes) is dropped —
 * at most ~0.25 ms, which is irrelevant at utterance boundaries.
 */
const BYTES_PER_STEREO_FRAME = 4; // int16 L + int16 R
const FRAMES_PER_GROUP = 3; // 48000 / 16000
const GROUP_BYTES = BYTES_PER_STEREO_FRAME * FRAMES_PER_GROUP; // 12

const INT16_MAX = 32767;
const INT16_MIN = -32768;

export function pcm48StereoToPcm16Mono(input: Buffer): Buffer {
  const outSamples = Math.floor(input.length / GROUP_BYTES);
  const out = Buffer.allocUnsafe(outSamples * 2);

  for (let i = 0; i < outSamples; i++) {
    const base = i * GROUP_BYTES;
    let acc = 0;
    for (let f = 0; f < FRAMES_PER_GROUP; f++) {
      const off = base + f * BYTES_PER_STEREO_FRAME;
      const left = input.readInt16LE(off);
      const right = input.readInt16LE(off + 2);
      acc += (left + right) / 2;
    }
    let mono = Math.round(acc / FRAMES_PER_GROUP);
    if (mono > INT16_MAX) mono = INT16_MAX;
    else if (mono < INT16_MIN) mono = INT16_MIN;
    out.writeInt16LE(mono, i * 2);
  }

  return out;
}

/** Target PCM format produced by {@link pcm48StereoToPcm16Mono}. */
export const PCM16_MONO = { sampleRate: 16_000, channels: 1, bitDepth: 16 } as const;
