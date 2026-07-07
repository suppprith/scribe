import type { Readable, Writable } from "node:stream";
import OpusScript from "opusscript";

/**
 * Streaming Ogg Opus encoder.
 *
 * scribe archives each meeting as one mono recording. Raw 16 kHz PCM is ~115
 * MB/hour; Opus at a modest voice bitrate is ~10× smaller with no meaningful
 * loss for speech, so this is what we upload to Drive. Encoding streams frame by
 * frame — the whole recording is never held in memory.
 *
 * There is no `ffmpeg` on the target host, so the container is muxed here by
 * hand: `opusscript` produces raw Opus packets and this module wraps them in a
 * minimal, spec-correct Ogg bitstream (RFC 7845) that any player accepts.
 */

/** Input PCM is 16 kHz mono signed-16-bit LE. Opus counts time in 48 kHz samples. */
const DEFAULT_SAMPLE_RATE = 16000;
/** 24 kbps mono is transparent for meeting speech and keeps files predictable. */
const DEFAULT_BITRATE = 24000;
/** 20 ms frames: Opus's most efficient packet size. */
const FRAME_MS = 20;
/** Flush a page roughly every second so a truncated file stays mostly playable. */
const FRAMES_PER_PAGE = 50;
/** Max segments in one Ogg page (the lacing table is a single byte count). */
const MAX_SEGMENTS = 255;

export interface OpusEncodeOptions {
  sampleRate?: number;
  bitrate?: number;
}

/** CRC-32/MPEG-2 (poly 0x04C11DB7, no reflection) — the checksum Ogg pages use. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n << 24;
    for (let k = 0; k < 8; k++) c = (c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1) >>> 0;
    table[n] = c >>> 0;
  }
  return table;
})();

function oggCrc(buf: Buffer): number {
  let crc = 0;
  for (let i = 0; i < buf.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ buf[i]!) & 0xff]!) >>> 0;
  }
  return crc >>> 0;
}

/** Encode a packet's byte length as an Ogg lacing sequence. */
function lacing(len: number): number[] {
  const segments: number[] = [];
  while (len >= 255) {
    segments.push(255);
    len -= 255;
  }
  segments.push(len); // a length that is a multiple of 255 ends with a 0
  return segments;
}

/** Serialize one Ogg page (header + lacing table + body) with its CRC filled in. */
function buildPage(
  headerType: number,
  granule: bigint,
  serial: number,
  seq: number,
  segments: number[],
  body: Buffer,
): Buffer {
  const page = Buffer.alloc(27 + segments.length + body.length);
  page.write("OggS", 0, "ascii");
  page.writeUInt8(0, 4); // stream structure version
  page.writeUInt8(headerType, 5);
  page.writeBigUInt64LE(granule, 6);
  page.writeUInt32LE(serial >>> 0, 14);
  page.writeUInt32LE(seq >>> 0, 18);
  // bytes 22..25 (CRC) stay zero while we compute the checksum
  page.writeUInt8(segments.length, 26);
  for (let i = 0; i < segments.length; i++) page.writeUInt8(segments[i]!, 27 + i);
  body.copy(page, 27 + segments.length);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

const HEADER_TYPE_BOS = 0x02;
const HEADER_TYPE_EOS = 0x04;

/** The 19-byte OpusHead identification header (RFC 7845 §5.1). */
function opusHead(channels: number, sampleRate: number): Buffer {
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "ascii");
  head.writeUInt8(1, 8); // version
  head.writeUInt8(channels, 9);
  // Pre-skip 0: nothing is trimmed on playback, so the first speaker's opening
  // syllable is never clipped (the encoder's few ms of lead-in is silence).
  head.writeUInt16LE(0, 10);
  head.writeUInt32LE(sampleRate, 12); // original input rate (informational)
  head.writeUInt16LE(0, 16); // output gain
  head.writeUInt8(0, 17); // channel mapping family 0 (mono/stereo)
  return head;
}

/** The OpusTags comment header with a vendor string and no user comments. */
function opusTags(): Buffer {
  const vendor = Buffer.from("scribe", "utf8");
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write("OpusTags", 0, "ascii");
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length); // user comment count
  return tags;
}

/**
 * Accumulates encoded Opus packets into Ogg pages and writes them to `out`,
 * applying backpressure. One instance encodes one stream start-to-finish.
 */
class OggMuxer {
  private readonly serial = (Math.random() * 0xffffffff) >>> 0;
  private seq = 0;
  private granule = 0n;
  private pageSegments: number[] = [];
  private pageBody: Buffer[] = [];
  private pagePackets = 0;

  constructor(private readonly out: Writable) {}

  private async write(buf: Buffer): Promise<void> {
    if (!this.out.write(buf)) {
      await new Promise<void>((resolve) => this.out.once("drain", resolve));
    }
  }

  /** Emit the two mandatory header pages (each is its own page, granule 0). */
  async writeHeaders(channels: number, sampleRate: number): Promise<void> {
    const head = opusHead(channels, sampleRate);
    await this.write(buildPage(HEADER_TYPE_BOS, 0n, this.serial, this.seq++, lacing(head.length), head));
    const tags = opusTags();
    await this.write(buildPage(0, 0n, this.serial, this.seq++, lacing(tags.length), tags));
  }

  /** Add one audio packet spanning `samples48k` (960 for a 20 ms frame). */
  async addPacket(packet: Buffer, samples48k: number): Promise<void> {
    const segs = lacing(packet.length);
    if (this.pageSegments.length + segs.length > MAX_SEGMENTS) await this.flush(false);
    this.pageSegments.push(...segs);
    this.pageBody.push(packet);
    this.granule += BigInt(samples48k);
    if (++this.pagePackets >= FRAMES_PER_PAGE) await this.flush(false);
  }

  private async flush(eos: boolean): Promise<void> {
    if (this.pageSegments.length === 0 && !eos) return;
    const body = Buffer.concat(this.pageBody);
    const page = buildPage(
      eos ? HEADER_TYPE_EOS : 0,
      this.granule,
      this.serial,
      this.seq++,
      this.pageSegments,
      body,
    );
    this.pageSegments = [];
    this.pageBody = [];
    this.pagePackets = 0;
    await this.write(page);
  }

  /** Flush the final page with the end-of-stream flag set. */
  async finish(): Promise<void> {
    await this.flush(true);
  }
}

/** Yield fixed-size frames (in bytes) from a byte stream, zero-padding the last. */
async function* frames(source: AsyncIterable<Buffer>, frameBytes: number): AsyncGenerator<Buffer> {
  let carry: Buffer = Buffer.alloc(0);
  for await (const chunk of source) {
    carry = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
    let off = 0;
    while (off + frameBytes <= carry.length) {
      yield carry.subarray(off, off + frameBytes);
      off += frameBytes;
    }
    carry = carry.subarray(off);
  }
  if (carry.length > 0) {
    const padded = Buffer.alloc(frameBytes);
    carry.copy(padded);
    yield padded;
  }
}

/**
 * Encode a stream of 16 kHz mono PCM (signed-16-bit LE) as Ogg Opus, writing the
 * result to `out`. Resolves once every page is flushed and `out` has drained;
 * the caller owns closing `out`.
 */
export async function encodePcmToOggOpus(
  source: Readable | AsyncIterable<Buffer>,
  out: Writable,
  opts: OpusEncodeOptions = {},
): Promise<void> {
  const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const bitrate = opts.bitrate ?? DEFAULT_BITRATE;
  const frameSamples = (sampleRate * FRAME_MS) / 1000; // 320 at 16 kHz
  const frameBytes = frameSamples * 2;
  const samples48k = 48000 * (FRAME_MS / 1000); // 960 — Opus granule unit

  // opusscript's constructor types the rate as a fixed union; ours is validated.
  const encoder = new OpusScript(sampleRate as 8000 | 12000 | 16000 | 24000 | 48000, 1, OpusScript.Application.AUDIO);
  encoder.setBitrate(bitrate);
  const muxer = new OggMuxer(out);
  try {
    await muxer.writeHeaders(1, sampleRate);
    for await (const frame of frames(source, frameBytes)) {
      const packet = encoder.encode(frame, frameSamples);
      await muxer.addPacket(packet, samples48k);
    }
    await muxer.finish();
  } finally {
    encoder.delete();
  }
}
