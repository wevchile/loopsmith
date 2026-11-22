import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ProviderRegistry, type MusicProvider } from '@loopsmith/providers';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { AudioTools, type AudioFormat } from './audio-length.js';
import { BACKUP_REGISTRY_FILE, formatLike, hashFile, nextBackupName, realFsOps, type FsOps } from './replace-service.js';

const HOST = { host: '127.0.0.1:3001' };

/** 16 bit PCM WAV; `seed` changes the samples so every file has its own hash. */
function wav(seed: number, frames = 4000, sampleRate = 8000, channels = 1): Buffer {
  const dataSize = frames * 2 * channels;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2 * channels, 28);
  buf.writeUInt16LE(2 * channels, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames * channels; i++) buf.writeInt16LE(Math.round(Math.sin((i * (seed + 1)) / 7) * 8000), 44 + i * 2);
  return buf;
}

const HAS_FFMPEG = await new AudioTools('ffmpeg').hasFfmpeg();

const MANIFEST_TEXT = (entries: object[]) =>
  JSON.stringify({ version: '1.0', gameRepo: 'game', entries }, null, 2).replace(/\n/g, '\r\n') + '\r\n';

interface Env {
  tmp: string;
  gameDir: string;
  manifestPath: string;
  app: FastifyInstance;
  projectId: string;
  projectPath: string;
  steps: string[];
  original: Buffer;
  call: (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => ReturnType<FastifyInstance['inject']>;
  gen: (prompt: string, format?: 'wav' | 'mp3') => Promise<{ id: string; outputPath: string }>;
}

async function setup(options: { audioTools?: AudioTools; fsOps?: (steps: string[]) => FsOps; mp3?: Buffer } = {}): Promise<Env> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-replace-'));
  const gameDir = path.join(tmp, 'game');
  await mkdir(path.join(gameDir, 'music'), { recursive: true });
  const original = wav(100, 8000, 22050, 2);
  await writeFile(path.join(gameDir, 'music', 'soundtrack_autum.wav'), original);
  await writeFile(path.join(gameDir, 'music', 'menu.wav'), wav(200));
  const manifestPath = path.join(gameDir, 'loopsmith-manifest.json');
  await writeFile(
    manifestPath,
    MANIFEST_TEXT([
      { id: 'autum', name: 'soundtrack_autum.wav', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/soundtrack_autum.wav', hash: await hashFile(path.join(gameDir, 'music', 'soundtrack_autum.wav')), duration: 0.363 },
      { id: 'menu', name: 'menu.wav', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/menu.wav', hash: 'sha256:menu' },
    ])
  );
  let counter = 0;
  let nextFormat: 'wav' | 'mp3' = 'wav';
  const fake: MusicProvider = {
    id: 'fake',
    name: 'Fake',
    model: 'fake-1',
    capabilities: { supportsInstrumental: true, supportsVocals: true, supportsReferenceAudio: false, maxDurationSeconds: 60, outputFormats: ['wav', 'mp3'] },
    async generate() {
      counter++;
      return nextFormat === 'mp3' ? { audioData: options.mp3!, format: 'mp3' } : { audioData: wav(counter), format: 'wav' };
    },
    async analyzeReference() {
      return 'autumn music';
    },
  };
  const registry = new ProviderRegistry();
  registry.registerProvider(fake);
  const steps: string[] = [];
  const app = await buildApp(loadConfig({ LOOPSMITH_ROOTS: './data' }, tmp), {
    logger: false,
    providerRegistry: registry,
    audioTools: options.audioTools ?? new AudioTools(false),
    fsOps: options.fsOps ? options.fsOps(steps) : tracingOps(steps),
  });
  const call: Env['call'] = (method, url, payload) =>
    app.inject({ method, url, headers: HOST, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const project = (await call('POST', '/api/projects', { name: 'Replace' })).json().project;
  expect((await call('POST', '/api/manifest/apply', { projectId: project.id, manifestPath })).statusCode).toBe(200);
  const gen: Env['gen'] = async (prompt, format = 'wav') => {
    nextFormat = format;
    const res = await call('POST', '/api/generate', { projectId: project.id, prompt, referenceTrackId: 'manifest:autum' });
    expect(res.statusCode).toBe(201);
    return res.json().entry;
  };
  return { tmp, gameDir, manifestPath, app, projectId: project.id, projectPath: project.path, steps, original, call, gen };
}

/** Real file operations that also record their order. */
function tracingOps(steps: string[], failOn?: (op: string, to: string) => boolean): FsOps {
  const name = (p: string) => path.basename(p).replace(/\.loopsmith-(tmp|revert)-[0-9a-f]+/, '.loopsmith-$1');
  return {
    async rename(from, to) {
      if (failOn?.('rename', to)) throw new Error('simulated rename failure');
      steps.push(`rename ${name(from)} -> ${name(to)}`);
      return realFsOps.rename(from, to);
    },
    async copyFile(from, to) {
      if (failOn?.('copy', to)) throw new Error('simulated copy failure');
      steps.push(`copy ${name(from)} -> ${name(to)}`);
      return realFsOps.copyFile(from, to);
    },
    async remove(target) {
      steps.push(`remove ${name(target)}`);
      return realFsOps.remove(target);
    },
  };
}

const music = (env: Env) => readdir(path.join(env.gameDir, 'music')).then((f) => f.sort());
const autum = (env: Env) => readFile(path.join(env.gameDir, 'music', 'soundtrack_autum.wav'));

describe('backup naming', () => {
  it('uses ascending numbers in the same folder and skips taken names', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-names-'));
    const file = path.join(dir, 'soundtrack_autum.wav');
    await writeFile(file, 'x');
    expect(path.basename(await nextBackupName(file))).toBe('soundtrack_autum_1.wav');
    await writeFile(path.join(dir, 'soundtrack_autum_1.wav'), 'x');
    expect(path.basename(await nextBackupName(file))).toBe('soundtrack_autum_2.wav');
    const reserved = new Set([path.join(dir, 'soundtrack_autum_2.wav').toLowerCase()]);
    expect(path.basename(await nextBackupName(file, reserved))).toBe('soundtrack_autum_3.wav');
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps the manifest formatting (indentation, CRLF, final newline)', () => {
    const text = '{\r\n    "a": 1,\r\n    "b": [\r\n        1\r\n    ]\r\n}\r\n';
    expect(formatLike(text, { a: 1, b: [1] })).toBe(text);
    expect(formatLike('{"a":1}', { a: 2 })).toBe('{"a":2}');
  });
});

describe('replace original', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => {
    await env.app.close();
    await rm(env.tmp, { recursive: true, force: true });
  });

  it('requires confirmation, a linked track and a fresh preview', async () => {
    const a = await env.gen('autumn A');
    const url = `/api/projects/${env.projectId}/generations/${a.id}/replace-original`;
    expect((await env.call('POST', url, {})).json().code).toBe('VALIDATION_ERROR');
    expect((await env.call('POST', url, { confirm: 'yes' })).statusCode).toBe(400);
    expect((await env.call('POST', url, { confirm: true, path: '../x' })).statusCode).toBe(400);
    expect((await env.call('POST', url, { confirm: true, expectedBackupName: 'other_9.wav' })).json().code).toBe('PREVIEW_STALE');
    await env.call('PATCH', `/api/projects/${env.projectId}/generations/${a.id}`, { originalTrackId: null });
    expect((await env.call('GET', url)).json().code).toBe('NOT_LINKED');
    await env.call('PATCH', `/api/projects/${env.projectId}/generations/${a.id}`, { originalTrackId: 'manifest:autum' });
    expect(await music(env)).toEqual(['menu.wav', 'soundtrack_autum.wav']);
    expect(env.steps).toEqual([]);
  });

  it('renames the original to a numbered backup before writing the AI track, then updates the manifest', async () => {
    const a = await env.gen('autumn B');
    const url = `/api/projects/${env.projectId}/generations/${a.id}/replace-original`;
    const preview = (await env.call('GET', url)).json().preview;
    expect(preview).toMatchObject({
      target: { relativePath: 'music/soundtrack_autum.wav', name: 'soundtrack_autum.wav' },
      backup: { relativePath: 'music/soundtrack_autum_1.wav', name: 'soundtrack_autum_1.wav' },
      conversion: null,
      activeReplacements: 0,
    });
    const manifestBefore = await readFile(env.manifestPath, 'utf-8');

    const res = await env.call('POST', url, { confirm: true, expectedBackupName: 'soundtrack_autum_1.wav' });
    expect(res.statusCode).toBe(200);
    // Order: original renamed first, then the AI track copied next to it and moved into its name.
    expect(env.steps).toEqual([
      'rename soundtrack_autum.wav -> soundtrack_autum_1.wav',
      'copy ' + path.basename(a.outputPath) + ' -> .soundtrack_autum.loopsmith-tmp.wav',
      'rename .soundtrack_autum.loopsmith-tmp.wav -> soundtrack_autum.wav',
    ]);
    expect(await music(env)).toEqual(['menu.wav', 'soundtrack_autum.wav', 'soundtrack_autum_1.wav']);
    expect(Buffer.compare(await readFile(path.join(env.gameDir, 'music', 'soundtrack_autum_1.wav')), env.original)).toBe(0);
    expect(Buffer.compare(await autum(env), await readFile(a.outputPath))).toBe(0);

    const record = res.json().record;
    expect(record).toMatchObject({ entryId: 'autum', relativePath: 'music/soundtrack_autum.wav', backupRelativePath: 'music/soundtrack_autum_1.wav', generationId: a.id, status: 'active' });
    expect(record.hashBefore).toBe(await hashFile(path.join(env.gameDir, 'music', 'soundtrack_autum_1.wav')));
    expect(record.hashAfter).toBe(await hashFile(path.join(env.gameDir, 'music', 'soundtrack_autum.wav')));

    // Manifest: only the replaced entry's hash changes; formatting (CRLF, 2 spaces) and order are kept.
    const manifestAfter = await readFile(env.manifestPath, 'utf-8');
    expect(record.durationAfter).toBe(0.5);
    expect(manifestAfter).toBe(manifestBefore.replace(record.hashBefore, record.hashAfter).replace('"duration": 0.363', '"duration": 0.5'));
    // Backups are not manifest entries; they are listed for generators to skip.
    const registry = JSON.parse(await readFile(path.join(env.gameDir, BACKUP_REGISTRY_FILE), 'utf-8'));
    expect(registry.files).toEqual([expect.objectContaining({ path: 'music/soundtrack_autum_1.wav', original: 'music/soundtrack_autum.wav', kind: 'backup' })]);
    // The snapshot follows, so "check for changes" shows nothing.
    const check = (await env.call('POST', '/api/manifest/preview', { projectId: env.projectId })).json();
    expect(check.summary.hasChanges).toBe(false);

    // An older generator script that lists the backup as an entry: Loopsmith ignores it.
    const withBackup = JSON.parse(manifestAfter);
    withBackup.entries.push({ id: 'autum-1', name: 'soundtrack_autum_1.wav', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/soundtrack_autum_1.wav' });
    await writeFile(env.manifestPath, JSON.stringify(withBackup, null, 2).replace(/\n/g, '\r\n') + '\r\n');
    expect((await env.call('POST', '/api/manifest/preview', { projectId: env.projectId })).json().summary.hasChanges).toBe(false);
    await writeFile(env.manifestPath, manifestAfter);

    const tracks = (await env.call('GET', `/api/projects/${env.projectId}/tracks`)).json().tracks as Array<Record<string, any>>;
    expect(tracks.find((t) => t.id === 'manifest:autum')!.replacement).toMatchObject({ active: 1, latest: { backupRelativePath: 'music/soundtrack_autum_1.wav' } });
    const aiTrack = tracks.find((t) => t.generationId === a.id)!;
    expect(aiTrack.generation).toMatchObject({ status: 'chosen', inGame: true });
  });

  it('stacks successive replacements and reverts them one by one', async () => {
    const b = await env.gen('autumn C');
    const firstAi = await autum(env);
    env.steps.length = 0;
    const res = await env.call('POST', `/api/projects/${env.projectId}/generations/${b.id}/replace-original`, { confirm: true });
    expect(res.json().record.backupRelativePath).toBe('music/soundtrack_autum_2.wav');
    expect(env.steps[0]).toBe('rename soundtrack_autum.wav -> soundtrack_autum_2.wav');
    expect(Buffer.compare(await readFile(path.join(env.gameDir, 'music', 'soundtrack_autum_2.wav')), firstAi)).toBe(0);

    const revertUrl = `/api/projects/${env.projectId}/originals/autum/revert`;
    expect((await env.call('POST', revertUrl, {})).statusCode).toBe(400);
    const preview = (await env.call('GET', revertUrl)).json().preview;
    expect(preview).toMatchObject({ backup: { name: 'soundtrack_autum_2.wav' }, current: { exists: true, matchesReplacement: true, action: 'delete' } });

    env.steps.length = 0;
    const r1 = await env.call('POST', revertUrl, { confirm: true });
    expect(r1.statusCode).toBe(200);
    expect(env.steps).toEqual([
      'rename soundtrack_autum.wav -> .soundtrack_autum.wav.loopsmith-revert',
      'rename soundtrack_autum_2.wav -> soundtrack_autum.wav',
      'remove .soundtrack_autum.wav.loopsmith-revert',
    ]);
    expect(Buffer.compare(await autum(env), firstAi)).toBe(0);
    expect(await music(env)).toEqual(['menu.wav', 'soundtrack_autum.wav', 'soundtrack_autum_1.wav']);

    const r2 = (await env.call('POST', revertUrl, { confirm: true })).json();
    expect(r2.matchesOriginal).toBe(true);
    expect(Buffer.compare(await autum(env), env.original)).toBe(0);
    expect(await music(env)).toEqual(['menu.wav', 'soundtrack_autum.wav']);
    const manifest = JSON.parse(await readFile(env.manifestPath, 'utf-8'));
    expect(manifest.entries[0]).toMatchObject({ hash: r2.record.hashBefore, duration: 0.363 });
    expect(JSON.parse(await readFile(path.join(env.gameDir, BACKUP_REGISTRY_FILE), 'utf-8')).files).toEqual([]);
    expect((await env.call('POST', '/api/manifest/preview', { projectId: env.projectId })).json().summary.hasChanges).toBe(false);
    expect((await env.call('POST', revertUrl, { confirm: true })).json().code).toBe('NO_REPLACEMENT');
    const records = (await env.call('GET', `/api/projects/${env.projectId}/replacements`)).json().replacements;
    expect(records.map((r: { status: string }) => r.status)).toEqual(['reverted', 'reverted']);
  });

  it('keeps the current file aside on revert when it was modified after the replacement', async () => {
    const c = await env.gen('autumn D');
    await env.call('POST', `/api/projects/${env.projectId}/generations/${c.id}/replace-original`, { confirm: true });
    await writeFile(path.join(env.gameDir, 'music', 'soundtrack_autum.wav'), wav(999));
    const revertUrl = `/api/projects/${env.projectId}/originals/autum/revert`;
    expect((await env.call('GET', revertUrl)).json().preview.current).toMatchObject({ action: 'keep', keepRelativePath: 'music/soundtrack_autum_2.wav' });
    const result = (await env.call('POST', revertUrl, { confirm: true })).json();
    expect(result.record.revertResult).toEqual({ action: 'kept', keptRelativePath: 'music/soundtrack_autum_2.wav' });
    expect(Buffer.compare(await autum(env), env.original)).toBe(0);
    expect(Buffer.compare(await readFile(path.join(env.gameDir, 'music', 'soundtrack_autum_2.wav')), wav(999))).toBe(0);
    const registry = JSON.parse(await readFile(path.join(env.gameDir, BACKUP_REGISTRY_FILE), 'utf-8'));
    expect(registry.files).toEqual([expect.objectContaining({ path: 'music/soundtrack_autum_2.wav', kind: 'replaced-version' })]);
  });
});

describe('replace original rollback', () => {
  it('restores the original when writing the AI track fails after the rename', async () => {
    // Fail only the move of the AI track into the original's name (not the rollback rename).
    let fail = true;
    const env = await setup({
      fsOps: (steps) =>
        tracingOps(steps, (op, to) => {
          if (fail && op === 'rename' && path.basename(to) === 'soundtrack_autum.wav') {
            fail = false;
            return true;
          }
          return false;
        }),
    });
    try {
      const a = await env.gen('autumn rollback');
      const manifestBefore = await readFile(env.manifestPath, 'utf-8');
      const res = await env.call('POST', `/api/projects/${env.projectId}/generations/${a.id}/replace-original`, { confirm: true });
      expect(res.statusCode).toBe(500);
      expect(env.steps.slice(0, 2)).toEqual([
        'rename soundtrack_autum.wav -> soundtrack_autum_1.wav',
        'copy ' + path.basename(a.outputPath) + ' -> .soundtrack_autum.loopsmith-tmp.wav',
      ]);
      expect(env.steps.at(-1)).toBe('rename soundtrack_autum_1.wav -> soundtrack_autum.wav');
      expect(await music(env)).toEqual(['menu.wav', 'soundtrack_autum.wav']);
      expect(Buffer.compare(await autum(env), env.original)).toBe(0);
      expect(await readFile(env.manifestPath, 'utf-8')).toBe(manifestBefore);
      expect((await env.call('GET', `/api/projects/${env.projectId}/replacements`)).json().replacements).toEqual([]);
      await expect(readFile(path.join(env.gameDir, BACKUP_REGISTRY_FILE))).rejects.toThrow();
    } finally {
      await env.app.close();
      await rm(env.tmp, { recursive: true, force: true });
    }
  });

  it('restores the original when the format conversion fails', async () => {
    class FailingTools extends AudioTools {
      constructor() {
        super(false);
      }
      override hasFfmpeg() {
        return Promise.resolve(true);
      }
      override async probeFormat(): Promise<AudioFormat> {
        return { sampleRate: 22050, channels: 2 };
      }
      override async measure() {
        return 1;
      }
      override async convert(): Promise<void> {
        throw new Error('simulated ffmpeg failure');
      }
    }
    const env = await setup({ audioTools: new FailingTools(), mp3: Buffer.from('ID3fake-mp3') });
    try {
      const a = await env.gen('autumn mp3', 'mp3');
      const preview = (await env.call('GET', `/api/projects/${env.projectId}/generations/${a.id}/replace-original`)).json().preview;
      expect(preview.conversion).toMatchObject({ from: 'mp3', to: 'wav', sampleRate: 22050, channels: 2 });
      const res = await env.call('POST', `/api/projects/${env.projectId}/generations/${a.id}/replace-original`, { confirm: true });
      expect(res.statusCode).toBe(500);
      expect(env.steps).toEqual([
        'rename soundtrack_autum.wav -> soundtrack_autum_1.wav',
        'remove .soundtrack_autum.loopsmith-tmp.wav',
        'rename soundtrack_autum_1.wav -> soundtrack_autum.wav',
      ]);
      expect(await music(env)).toEqual(['menu.wav', 'soundtrack_autum.wav']);
      expect(Buffer.compare(await autum(env), env.original)).toBe(0);
    } finally {
      await env.app.close();
      await rm(env.tmp, { recursive: true, force: true });
    }
  });

  it('refuses to convert without ffmpeg before touching anything', async () => {
    const env = await setup({ mp3: Buffer.from('ID3fake-mp3') });
    try {
      const a = await env.gen('autumn mp3', 'mp3');
      const res = await env.call('POST', `/api/projects/${env.projectId}/generations/${a.id}/replace-original`, { confirm: true });
      expect(res.json().code).toBe('FFMPEG_REQUIRED');
      expect(env.steps).toEqual([]);
      expect(await music(env)).toEqual(['menu.wav', 'soundtrack_autum.wav']);
    } finally {
      await env.app.close();
      await rm(env.tmp, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!HAS_FFMPEG)('replace original with ffmpeg conversion', () => {
  it('converts an MP3 AI track to the original WAV format, keeping sample rate and channels', async () => {
    const mp3Dir = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-mp3-'));
    const mp3Path = path.join(mp3Dir, 'ai.mp3');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=1', '-ar', '44100', '-ac', '1', mp3Path]);
    const tools = new AudioTools('ffmpeg');
    const env = await setup({ audioTools: tools, mp3: await readFile(mp3Path) });
    try {
      const a = await env.gen('autumn mp3', 'mp3');
      const url = `/api/projects/${env.projectId}/generations/${a.id}/replace-original`;
      const preview = (await env.call('GET', url)).json().preview;
      expect(preview.conversion).toMatchObject({ from: 'mp3', to: 'wav', sampleRate: 22050, channels: 2, codec: 'pcm_s16le' });
      const res = await env.call('POST', url, { confirm: true });
      expect(res.statusCode).toBe(200);
      expect(env.steps).toEqual(['rename soundtrack_autum.wav -> soundtrack_autum_1.wav', 'rename .soundtrack_autum.loopsmith-tmp.wav -> soundtrack_autum.wav']);
      const format = await tools.probeFormat(path.join(env.gameDir, 'music', 'soundtrack_autum.wav'));
      expect(format).toMatchObject({ codec: 'pcm_s16le', sampleRate: 22050, channels: 2 });
      const manifest = JSON.parse(await readFile(env.manifestPath, 'utf-8'));
      expect(manifest.entries[0].duration).toBeGreaterThan(0.9);
      expect(manifest.entries[0].hash).toBe(res.json().record.hashAfter);
      expect(res.json().record.conversion).toMatchObject({ from: 'mp3', to: 'wav' });
    } finally {
      await env.app.close();
      await rm(env.tmp, { recursive: true, force: true });
      await rm(mp3Dir, { recursive: true, force: true });
    }
  });
});
