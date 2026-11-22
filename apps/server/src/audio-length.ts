import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Lyria has no duration parameter, so Loopsmith enforces the requested length locally:
 * ffmpeg when it is installed (re-encode with a fade-out), otherwise a pure JavaScript
 * cut (WAV with fade-out, MP3 at a frame boundary without fade).
 */

export interface TrimResult {
  method: 'ffmpeg' | 'js';
  fadeOutSeconds: number;
}

function run(command: string, args: string[], timeoutMs = 60_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export class AudioTools {
  private ffmpegAvailable?: Promise<boolean>;

  /** @param ffmpegPath ffmpeg executable (LOOPSMITH_FFMPEG), "ffmpeg" from PATH by default, or false to disable it. */
  constructor(private readonly ffmpegPath: string | false = 'ffmpeg') {}

  private get ffprobePath(): string {
    const ffmpeg = this.ffmpegPath || 'ffmpeg';
    const dir = path.dirname(ffmpeg);
    const ext = path.extname(ffmpeg);
    const probe = `ffprobe${ext}`;
    return dir === '.' && !ffmpeg.includes('/') && !ffmpeg.includes('\\') ? probe : path.join(dir, probe);
  }

  hasFfmpeg(): Promise<boolean> {
    if (this.ffmpegPath === false) return Promise.resolve(false);
    this.ffmpegAvailable ??= run(this.ffmpegPath, ['-version'], 10_000)
      .then((r) => r.code === 0)
      .catch(() => false);
    return this.ffmpegAvailable;
  }

  /** Duration in seconds, from ffprobe when available, otherwise from the WAV header or MP3 frames. */
  async measure(filePath: string): Promise<number | undefined> {
    if (await this.hasFfmpeg()) {
      try {
        const r = await run(this.ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath], 20_000);
        const value = Number.parseFloat(r.stdout.trim());
        if (r.code === 0 && Number.isFinite(value) && value > 0) return value;
      } catch {
        // fall back to JS
      }
    }
    return measureBuffer(await readFile(filePath), filePath);
  }

  /** Writes `input` cut to `seconds` (with a fade-out) to `output`. */
  async trim(input: string, output: string, seconds: number, fadeOutSeconds: number): Promise<TrimResult> {
    const fade = Math.max(0, Math.min(fadeOutSeconds, seconds / 4));
    const ext = path.extname(output).toLowerCase();
    if (await this.hasFfmpeg()) {
      const codec = ext === '.wav' ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'libmp3lame', '-b:a', '192k'];
      const filter = fade > 0 ? ['-af', `afade=t=out:st=${(seconds - fade).toFixed(3)}:d=${fade.toFixed(3)}`] : [];
      const r = await run(this.ffmpegPath as string, [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-t', seconds.toFixed(3), ...filter, '-map_metadata', '0', ...codec, output,
      ]);
      if (r.code === 0) return { method: 'ffmpeg', fadeOutSeconds: fade };
      throw new Error(`ffmpeg failed: ${r.stderr.trim().slice(0, 300)}`);
    }
    const data = await readFile(input);
    if (ext === '.wav') {
      await writeFile(output, trimWav(data, seconds, fade));
      return { method: 'js', fadeOutSeconds: fade };
    }
    if (ext === '.mp3') {
      await writeFile(output, trimMp3(data, seconds));
      return { method: 'js', fadeOutSeconds: 0 };
    }
    throw new Error(`Cannot trim ${ext} files without ffmpeg`);
  }
}

export function measureBuffer(data: Buffer, filePath: string): number | undefined {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.wav') return readWav(data).seconds;
    if (ext === '.mp3') return scanMp3(data).seconds;
  } catch {
    return undefined;
  }
  return undefined;
}

// ---------- WAV ----------

interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  audioFormat: number;
  blockAlign: number;
  dataOffset: number;
  dataLength: number;
  seconds: number;
}

export function readWav(data: Buffer): WavInfo {
  if (data.length < 12 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file');
  }
  let offset = 12;
  let fmt: Omit<WavInfo, 'dataOffset' | 'dataLength' | 'seconds'> | undefined;
  while (offset + 8 <= data.length) {
    const id = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      const audioFormat = data.readUInt16LE(body);
      fmt = {
        audioFormat: audioFormat === 0xfffe && size >= 26 ? data.readUInt16LE(body + 24) : audioFormat,
        channels: data.readUInt16LE(body + 2),
        sampleRate: data.readUInt32LE(body + 4),
        blockAlign: data.readUInt16LE(body + 12),
        bitsPerSample: data.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data chunk before fmt chunk');
      const dataLength = Math.min(size, data.length - body);
      return { ...fmt, dataOffset: body, dataLength, seconds: dataLength / (fmt.sampleRate * fmt.blockAlign) };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV file has no data chunk');
}

/** Cuts a WAV file to `seconds` and applies a linear fade-out (16/24/32-bit PCM and 32-bit float). */
export function trimWav(data: Buffer, seconds: number, fadeOutSeconds: number): Buffer {
  const info = readWav(data);
  const frames = Math.min(Math.floor(seconds * info.sampleRate), Math.floor(info.dataLength / info.blockAlign));
  const length = frames * info.blockAlign;
  const pcm = Buffer.from(data.subarray(info.dataOffset, info.dataOffset + length));

  const fadeFrames = Math.min(frames, Math.floor(fadeOutSeconds * info.sampleRate));
  const bytes = info.bitsPerSample / 8;
  for (let f = frames - fadeFrames; f < frames; f++) {
    const gain = (frames - f) / (fadeFrames || 1);
    for (let c = 0; c < info.channels; c++) {
      const at = f * info.blockAlign + c * bytes;
      if (info.audioFormat === 3 && bytes === 4) pcm.writeFloatLE(pcm.readFloatLE(at) * gain, at);
      else if (info.audioFormat === 1 && bytes === 2) pcm.writeInt16LE(Math.round(pcm.readInt16LE(at) * gain), at);
      else if (info.audioFormat === 1 && bytes === 3) pcm.writeIntLE(Math.round(pcm.readIntLE(at, 3) * gain), at, 3);
      else if (info.audioFormat === 1 && bytes === 4) pcm.writeInt32LE(Math.round(pcm.readInt32LE(at) * gain), at);
    }
  }

  const header = Buffer.from(data.subarray(0, info.dataOffset));
  header.writeUInt32LE(length, info.dataOffset - 4);
  header.writeUInt32LE(header.length - 8 + length, 4);
  return Buffer.concat([header, pcm]);
}

// ---------- MP3 ----------

const MPEG1_BITRATES = [
  [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], // layer I
  [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], // layer II
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // layer III
];
const MPEG2_BITRATES = [
  [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], // layer I
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // layers II and III
];
const SAMPLE_RATES = [44100, 48000, 32000];

interface Mp3Frame {
  offset: number;
  length: number;
  samples: number;
  sampleRate: number;
}

function parseFrameHeader(data: Buffer, offset: number): Mp3Frame | null {
  if (offset + 4 > data.length) return null;
  const b1 = data[offset + 1]!;
  if (data[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const versionBits = (b1 >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layerBits = (b1 >> 1) & 3; // 3 = I, 2 = II, 1 = III
  if (versionBits === 1 || layerBits === 0) return null;
  const b2 = data[offset + 2]!;
  const bitrateIndex = b2 >> 4;
  const rateIndex = (b2 >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const padding = (b2 >> 1) & 1;
  const layer = 4 - layerBits;
  const mpeg1 = versionBits === 3;
  const sampleRate = SAMPLE_RATES[rateIndex]! / (mpeg1 ? 1 : versionBits === 2 ? 2 : 4);
  const kbps = mpeg1 ? MPEG1_BITRATES[layer - 1]![bitrateIndex]! : MPEG2_BITRATES[layer === 1 ? 0 : 1]![bitrateIndex]!;
  const bitrate = kbps * 1000;
  let samples: number;
  let length: number;
  if (layer === 1) {
    samples = 384;
    length = (Math.floor((12 * bitrate) / sampleRate) + padding) * 4;
  } else {
    samples = layer === 3 && !mpeg1 ? 576 : 1152;
    length = Math.floor((samples / 8) * bitrate / sampleRate) + padding;
  }
  return length > 4 ? { offset, length, samples, sampleRate } : null;
}

function id3v2Size(data: Buffer): number {
  if (data.length < 10 || data.toString('latin1', 0, 3) !== 'ID3') return 0;
  const size = ((data[6]! & 0x7f) << 21) | ((data[7]! & 0x7f) << 14) | ((data[8]! & 0x7f) << 7) | (data[9]! & 0x7f);
  const footer = data[5]! & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

function isInfoFrame(data: Buffer, frame: Mp3Frame): boolean {
  const body = data.subarray(frame.offset, frame.offset + Math.min(frame.length, 64)).toString('latin1');
  return body.includes('Xing') || body.includes('Info') || body.includes('VBRI');
}

export function scanMp3(data: Buffer): { tagLength: number; frames: Mp3Frame[]; seconds: number } {
  const tagLength = id3v2Size(data);
  const frames: Mp3Frame[] = [];
  let offset = tagLength;
  let seconds = 0;
  while (offset + 4 <= data.length) {
    const frame = parseFrameHeader(data, offset);
    if (!frame || frame.offset + frame.length > data.length) {
      if (frames.length > 0) break; // trailing tag (ID3v1, APE), truncated frame or garbage
      offset++;
      continue;
    }
    frames.push(frame);
    offset += frame.length;
  }
  for (const [i, frame] of frames.entries()) {
    if (i === 0 && isInfoFrame(data, frame)) continue;
    seconds += frame.samples / frame.sampleRate;
  }
  if (frames.length === 0) throw new Error('No MP3 frames found');
  return { tagLength, frames, seconds };
}

/** Cuts an MP3 at the last frame boundary before `seconds` (no re-encode, so no fade-out). */
export function trimMp3(data: Buffer, seconds: number): Buffer {
  const { tagLength, frames } = scanMp3(data);
  const parts: Buffer[] = [data.subarray(0, tagLength)];
  let elapsed = 0;
  for (const [i, frame] of frames.entries()) {
    // Drop the Xing/Info header: its frame count would describe the untrimmed file.
    if (i === 0 && isInfoFrame(data, frame)) continue;
    const next = elapsed + frame.samples / frame.sampleRate;
    if (next > seconds + 1e-6) break;
    parts.push(data.subarray(frame.offset, frame.offset + frame.length));
    elapsed = next;
  }
  return Buffer.concat(parts);
}
