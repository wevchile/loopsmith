import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AudioTools, readWav, trimWav, scanMp3, trimMp3, measureBuffer } from './audio-length.js';

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0;

/** 16-bit stereo 44.1 kHz WAV with a 220 Hz sine, so every sample position is distinguishable. */
function sineWav(seconds: number): Buffer {
  const rate = 44100;
  const frames = Math.round(seconds * rate);
  const buf = wav(seconds, rate, 2);
  for (let f = 0; f < frames; f++) {
    const v = Math.round(12000 * Math.sin((2 * Math.PI * 220 * f) / rate));
    buf.writeInt16LE(v, 44 + f * 4);
    buf.writeInt16LE(v, 44 + f * 4 + 2);
  }
  return buf;
}

describe.skipIf(!HAS_FFMPEG)('loop seam (ffmpeg)', () => {
  it('writes exactly N seconds and wraps on consecutive samples of the model output', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-seam-'));
    const input = path.join(dir, 'in.wav');
    const output = path.join(dir, 'out.wav');
    const source = sineWav(17);
    await writeFile(input, source);
    const result = await new AudioTools('ffmpeg').loopSeam(input, output, 16, 0.25);
    const data = await readFile(output);
    const info = readWav(data);
    expect(result.frames).toBe(16 * 44100);
    expect(info).toMatchObject({ sampleRate: 44100, channels: 2, bitsPerSample: 16 });
    expect(info.dataLength / info.blockAlign).toBe(16 * 44100);
    const sample = (buf: Buffer, offset: number, frame: number) => buf.readInt16LE(offset + frame * 4);
    // The loop starts where the model was at 16 s and ends one sample before it: no jump at the wrap.
    expect(Math.abs(sample(data, info.dataOffset, 0) - sample(source, 44, 16 * 44100))).toBeLessThanOrEqual(1);
    expect(Math.abs(sample(data, info.dataOffset, 16 * 44100 - 1) - sample(source, 44, 16 * 44100 - 1))).toBeLessThanOrEqual(1);
    await rm(dir, { recursive: true, force: true });
  });

  it('decodes MP3 once and still gives an exact frame count', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-seam-'));
    const input = path.join(dir, 'in.mp3');
    const output = path.join(dir, 'out.wav');
    spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-ac', '2', '-c:a', 'libmp3lame', input], { windowsHide: true });
    await new AudioTools('ffmpeg').loopSeam(input, output, 16, 0.25);
    const info = readWav(await readFile(output));
    expect(info.dataLength / info.blockAlign).toBe(16 * 44100);
    await rm(dir, { recursive: true, force: true });
  });
});

/** 16-bit PCM WAV filled with a constant non-zero level so the fade-out is visible. */
function wav(seconds: number, sampleRate = 8000, channels = 2): Buffer {
  const frames = Math.round(seconds * sampleRate);
  const dataSize = frames * channels * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 44; i < buf.length; i += 2) buf.writeInt16LE(10000, i);
  return buf;
}

/** MPEG-1 Layer III, 128 kbps, 44.1 kHz frames (417 bytes, 1152 samples each). */
const FRAME_SECONDS = 1152 / 44100;
function mp3(frameCount: number, withXing = false): Buffer {
  const frame = (tag?: string) => {
    const f = Buffer.alloc(417);
    f.set([0xff, 0xfb, 0x90, 0x00]);
    if (tag) f.write(tag, 36, 'latin1');
    return f;
  };
  const id3 = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 10, ...new Array(10).fill(0)]);
  return Buffer.concat([id3, ...(withXing ? [frame('Xing')] : []), ...Array.from({ length: frameCount }, () => frame())]);
}

describe('WAV trimming', () => {
  it('cuts to the requested length, fixes the header and fades out', () => {
    const out = trimWav(wav(4), 1.5, 0.5);
    const info = readWav(out);
    expect(info.seconds).toBeCloseTo(1.5, 3);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out.readInt16LE(44)).toBe(10000); // start untouched
    expect(Math.abs(out.readInt16LE(out.length - 2))).toBeLessThan(50); // end faded to silence
    expect(measureBuffer(out, 'x.wav')).toBeCloseTo(1.5, 3);
  });
});

describe('MP3 trimming', () => {
  it('measures frames and skips the ID3 tag and Xing header', () => {
    const scan = scanMp3(mp3(100, true));
    expect(scan.tagLength).toBe(20);
    expect(scan.seconds).toBeCloseTo(100 * FRAME_SECONDS, 3);
  });

  it('cuts at a frame boundary and drops the stale Xing header', () => {
    const out = trimMp3(mp3(200, true), 1);
    const scan = scanMp3(out);
    expect(scan.seconds).toBeLessThanOrEqual(1);
    expect(scan.seconds).toBeGreaterThan(1 - FRAME_SECONDS);
    expect(out.subarray(0, 3).toString('latin1')).toBe('ID3');
    expect(out.includes(Buffer.from('Xing'))).toBe(false);
  });
});
