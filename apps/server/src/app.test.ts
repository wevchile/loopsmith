import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ProviderRegistry, type MusicProvider } from '@loopsmith/providers';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { AudioTools } from './audio-length.js';

/** Builds a tiny valid PCM WAV file (mono, 8 kHz, silence). */
function tinyWav(samples = 800): Buffer {
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(16000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

const HOST = { host: '127.0.0.1:3001' };

describe('server API without an API key', () => {
  let tmp: string;
  let gameDir: string;
  let app: FastifyInstance;
  let projectId: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-test-'));
    gameDir = path.join(tmp, 'my-game');
    await mkdir(path.join(gameDir, 'assets', 'music'), { recursive: true });
    await mkdir(path.join(gameDir, 'assets', 'sfx'), { recursive: true });
    await writeFile(path.join(gameDir, 'assets', 'music', 'theme.wav'), tinyWav());
    await writeFile(path.join(gameDir, 'assets', 'sfx', 'jump.wav'), tinyWav(200));
    await writeFile(
      path.join(gameDir, 'loopsmith-manifest.json'),
      JSON.stringify({
        version: '1.0',
        gameRepo: 'my-game',
        entries: [
          { id: 'theme', name: 'theme.wav', type: 'SOUNDTRACK', folder: 'music', relativePath: 'assets/music/theme.wav' },
          { id: 'jump', name: 'jump.wav', type: 'SFX', folder: 'sfx', relativePath: 'assets/sfx/jump.wav' },
        ],
      })
    );
    const config = loadConfig({ LOOPSMITH_ROOTS: './data', GEMINI_API_KEY: 'your_gemini_api_key_here' }, tmp);
    app = await buildApp(config, { logger: false });
  });

  afterAll(async () => {
    await app.close();
    await rm(tmp, { recursive: true, force: true });
  });

  it('reports that generation is unavailable without crashing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: HOST });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.apiKeyConfigured).toBe(false);
    expect(body.generation.available).toBe(false);
    expect(body.generation.message).toMatch(/GEMINI_API_KEY/);
  });

  it('rejects foreign hosts and origins', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/api/health', headers: { ...HOST, origin: 'https://evil.example' } })).statusCode
    ).toBe(403);
  });

  it('creates a project with default type folders and context', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: HOST,
      payload: { name: 'Mi Juego Retro', context: 'retro 8-bit' },
    });
    expect(res.statusCode).toBe(201);
    const { project } = res.json();
    projectId = project.id;
    expect(project.context).toBe('retro 8-bit');
    expect(project.defaultVocalsEnabled).toBe(false);
    for (const folder of ['SOUNDTRACK', 'SFX', 'VO', 'AMBIENCE', 'OTHER']) {
      await access(path.join(project.path, folder));
    }
    const dup = await app.inject({ method: 'POST', url: '/api/projects', headers: HOST, payload: { name: 'Mi Juego Retro' } });
    expect(dup.statusCode).toBe(409);
  });

  it('updates the context but never the path', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}`,
      headers: HOST,
      payload: { context: 'orchestral', path: 'C:/Windows' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().project.context).toBe('orchestral');
    expect(res.json().project.path).toContain('Mi_Juego_Retro');
  });

  it('supports folder CRUD and blocks traversal', async () => {
    const url = `/api/projects/${projectId}/folders`;
    expect((await app.inject({ method: 'POST', url, headers: HOST, payload: { parent: 'SOUNDTRACK', name: 'boss' } })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url, headers: HOST, payload: { parent: 'SOUNDTRACK', name: 'boss' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url, headers: HOST, payload: { parent: '..', name: 'evil' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url, headers: HOST, payload: { parent: '', name: '../evil' } })).statusCode).toBe(400);

    const renamed = await app.inject({ method: 'PATCH', url, headers: HOST, payload: { path: 'SOUNDTRACK/boss', newName: 'final-boss' } });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().path).toBe('SOUNDTRACK/final-boss');

    const tree = (await app.inject({ method: 'GET', url, headers: HOST })).json().tree;
    const soundtrack = tree.children.find((c: { name: string }) => c.name === 'SOUNDTRACK');
    expect(soundtrack.children.map((c: { name: string }) => c.name)).toEqual(['final-boss']);

    expect((await app.inject({ method: 'DELETE', url: `${url}?path=..`, headers: HOST })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: `${url}?path=`, headers: HOST })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: `${url}?path=SOUNDTRACK`, headers: HOST })).statusCode).toBe(409);
    expect(
      (await app.inject({ method: 'DELETE', url: `${url}?path=SOUNDTRACK/final-boss`, headers: { ...HOST, 'content-type': 'application/json' } }))
        .statusCode
    ).toBe(200);
  });

  it('previews, applies and re-syncs a manifest', async () => {
    const manifestPath = path.join(gameDir, 'loopsmith-manifest.json');
    const preview = await app.inject({ method: 'POST', url: '/api/manifest/preview', headers: HOST, payload: { projectId, manifestPath } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().summary.added).toBe(2);
    expect(preview.json().missingFiles).toEqual([]);

    const applied = await app.inject({ method: 'POST', url: '/api/manifest/apply', headers: HOST, payload: { projectId, manifestPath } });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().project.manifestPath).toBe(manifestPath);

    const tracks = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/tracks`, headers: HOST })).json().tracks;
    expect(tracks.map((t: { id: string }) => t.id).sort()).toEqual(['manifest:jump', 'manifest:theme']);

    // The game repo changes: the theme is renamed and a new file appears.
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    manifest.entries[0].name = 'main-theme.wav';
    manifest.entries.push({ id: 'rain', name: 'rain.wav', type: 'AMBIENCE', folder: 'amb', relativePath: 'assets/amb/rain.wav' });
    await writeFile(manifestPath, JSON.stringify(manifest));

    const resync = await app.inject({ method: 'POST', url: '/api/manifest/preview', headers: HOST, payload: { projectId } });
    expect(resync.json().summary).toMatchObject({ added: 1, renamed: 1, removed: 0, unchanged: 1, hasChanges: true });
    expect(resync.json().missingFiles).toEqual(['rain']);
  });

  it('rejects manifests that point outside their folder', async () => {
    const bad = path.join(gameDir, 'bad-manifest.json');
    await writeFile(
      bad,
      JSON.stringify({ version: '1.0', gameRepo: 'x', entries: [{ id: 'a', name: 'a', type: 'SFX', folder: '', relativePath: '../../secret.wav' }] })
    );
    const res = await app.inject({ method: 'POST', url: '/api/manifest/preview', headers: HOST, payload: { projectId, manifestPath: bad } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MANIFEST_PATH_OUTSIDE');
  });

  it('streams manifest audio with range support and refuses unknown tracks', async () => {
    const url = `/api/projects/${projectId}/audio?trackId=${encodeURIComponent('manifest:theme')}`;
    const full = await app.inject({ method: 'GET', url, headers: HOST });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('audio/wav');
    expect(full.rawPayload.length).toBe(44 + 1600);

    const partial = await app.inject({ method: 'GET', url, headers: { ...HOST, range: 'bytes=0-43' } });
    expect(partial.statusCode).toBe(206);
    expect(partial.rawPayload.subarray(0, 4).toString()).toBe('RIFF');
    expect(partial.headers['content-range']).toBe('bytes 0-43/1644');

    const evil = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/audio?trackId=${encodeURIComponent('local:../../my-game/assets/music/theme.wav')}`,
      headers: HOST,
    });
    expect(evil.statusCode).toBe(400);
    const unknown = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/audio?trackId=manifest:nope`, headers: HOST });
    expect(unknown.statusCode).toBe(404);
  });

  it('returns a clear 503 when generating without an API key', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/generate', headers: HOST, payload: { projectId, prompt: 'boss theme' } });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('API_KEY_MISSING');
    expect(res.json().error).toMatch(/GEMINI_API_KEY/);
  });
});

describe('generation with a fake provider', () => {
  it('saves the file locally, applies context, instrumental default and reference, and records history', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-gen-'));
    const calls: Array<{ prompt: string; vocalsEnabled: boolean }> = [];
    const fake: MusicProvider = {
      id: 'fake',
      name: 'Fake',
      model: 'fake-1',
      capabilities: { supportsInstrumental: true, supportsVocals: true, supportsReferenceAudio: false, maxDurationSeconds: 60, outputFormats: ['wav'] },
      async generate(req) {
        calls.push(req);
        return { audioData: tinyWav(), format: 'wav' };
      },
      async analyzeReference() {
        return 'slow ambient pad in A minor';
      },
    };
    const registry = new ProviderRegistry();
    registry.registerProvider(fake);
    const app = await buildApp(loadConfig({ LOOPSMITH_ROOTS: './data' }, tmp), { logger: false, providerRegistry: registry });

    const { project } = (
      await app.inject({ method: 'POST', url: '/api/projects', headers: HOST, payload: { name: 'Game', context: '8-bit' } })
    ).json();

    const first = await app.inject({ method: 'POST', url: '/api/generate', headers: HOST, payload: { projectId: project.id, prompt: 'Overworld theme' } });
    expect(first.statusCode).toBe(201);
    const entry = first.json().entry;
    expect(calls[0].vocalsEnabled).toBe(false);
    expect(calls[0].prompt).toContain('8-bit');
    await access(entry.outputPath);
    expect(entry.outputTrackId.startsWith('local:SOUNDTRACK/')).toBe(true);

    const second = await app.inject({
      method: 'POST',
      url: '/api/generate',
      headers: HOST,
      payload: { projectId: project.id, prompt: 'faster', referenceTrackId: entry.outputTrackId, vocalsEnabled: true, outputFolder: 'OTHER' },
    });
    expect(second.statusCode).toBe(201);
    expect(calls[1].prompt).toContain('slow ambient pad');
    expect(calls[1].vocalsEnabled).toBe(true);

    const badFolder = await app.inject({
      method: 'POST',
      url: '/api/generate',
      headers: HOST,
      payload: { projectId: project.id, prompt: 'x', outputFolder: '../../outside' },
    });
    expect(badFolder.statusCode).toBe(400);

    const history = (await app.inject({ method: 'GET', url: `/api/projects/${project.id}/history`, headers: HOST })).json().history;
    expect(history).toHaveLength(2);
    const tracks = (await app.inject({ method: 'GET', url: `/api/projects/${project.id}/tracks`, headers: HOST })).json().tracks;
    expect(tracks.filter((t: { isGenerated: boolean }) => t.isGenerated)).toHaveLength(2);

    await app.close();
    await rm(tmp, { recursive: true, force: true });
  });
});

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0;

describe('duration enforcement', () => {
  async function setup(audioTools: AudioTools, env: Record<string, string> = {}) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-trim-'));
    const fake: MusicProvider = {
      id: 'fake',
      name: 'Fake',
      model: 'fake-1',
      capabilities: { supportsInstrumental: true, supportsVocals: true, supportsReferenceAudio: false, maxDurationSeconds: 60, outputFormats: ['wav'] },
      async generate() {
        // 4 seconds, much longer than requested, like Lyria ignoring the length hint.
        return { audioData: tinyWav(32000), format: 'wav', structure: '[[A0]]' };
      },
    };
    const registry = new ProviderRegistry();
    registry.registerProvider(fake);
    const app = await buildApp(loadConfig({ LOOPSMITH_ROOTS: './data', ...env }, tmp), { logger: false, providerRegistry: registry, audioTools });
    const { project } = (await app.inject({ method: 'POST', url: '/api/projects', headers: HOST, payload: { name: 'Trim' } })).json();
    return { tmp, app, project };
  }

  it('trims to the requested seconds, keeps the original hidden and records both', async () => {
    const { tmp, app, project } = await setup(new AudioTools(false));
    const res = await app.inject({ method: 'POST', url: '/api/generate', headers: HOST, payload: { projectId: project.id, prompt: 'jingle', duration: 2 } });
    expect(res.statusCode).toBe(201);
    const { entry } = res.json();
    expect(entry.audio).toMatchObject({ requestedSeconds: 2, generatedSeconds: 4, finalSeconds: 2, trimmed: true, trimMethod: 'js' });
    expect(entry.structure).toBe('[[A0]]');
    expect(entry.lyrics).toBeUndefined();
    await access(entry.audio.untrimmedPath);
    expect(entry.audio.untrimmedPath).toContain('.loopsmith-untrimmed');
    const tracks = (await app.inject({ method: 'GET', url: `/api/projects/${project.id}/tracks`, headers: HOST })).json().tracks;
    expect(tracks).toHaveLength(1);

    const untouched = await app.inject({ method: 'POST', url: '/api/generate', headers: HOST, payload: { projectId: project.id, prompt: 'long', duration: 30 } });
    expect(untouched.json().entry.audio).toMatchObject({ requestedSeconds: 30, generatedSeconds: 4, trimmed: false });
    await app.close();
    await rm(tmp, { recursive: true, force: true });
  });

  it('can drop the original and can be turned off', async () => {
    const off = await setup(new AudioTools(false), { LOOPSMITH_TRIM_TO_DURATION: 'false' });
    const a = (await off.app.inject({ method: 'POST', url: '/api/generate', headers: HOST, payload: { projectId: off.project.id, prompt: 'x', duration: 2 } })).json();
    expect(a.entry.audio).toMatchObject({ generatedSeconds: 4, trimmed: false });
    await off.app.close();
    await rm(off.tmp, { recursive: true, force: true });

    const noKeep = await setup(new AudioTools(false), { LOOPSMITH_KEEP_UNTRIMMED: 'false' });
    const b = (await noKeep.app.inject({ method: 'POST', url: '/api/generate', headers: HOST, payload: { projectId: noKeep.project.id, prompt: 'x', duration: 2 } })).json();
    expect(b.entry.audio).toMatchObject({ finalSeconds: 2, trimmed: true });
    expect(b.entry.audio.untrimmedPath).toBeUndefined();
    await noKeep.app.close();
    await rm(noKeep.tmp, { recursive: true, force: true });
  });

  it.skipIf(!HAS_FFMPEG)('uses ffmpeg with a fade-out when it is installed', async () => {
    const { tmp, app, project } = await setup(new AudioTools('ffmpeg'));
    const { entry } = (await app.inject({ method: 'POST', url: '/api/generate', headers: HOST, payload: { projectId: project.id, prompt: 'x', duration: 1.5 } })).json();
    expect(entry.audio.trimMethod).toBe('ffmpeg');
    expect(entry.audio.finalSeconds).toBeCloseTo(1.5, 1);
    expect(entry.audio.fadeOutSeconds).toBeGreaterThan(0);
    await app.close();
    await rm(tmp, { recursive: true, force: true });
  });
});

describe('unsupported LYRIA_MODEL', () => {
  it('reports the realtime model as a configuration error instead of crashing', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-model-'));
    const app = await buildApp(loadConfig({ LOOPSMITH_ROOTS: './data', GEMINI_API_KEY: 'test-key', LYRIA_MODEL: 'lyria-realtime-exp' }, tmp), { logger: false });
    const health = (await app.inject({ method: 'GET', url: '/api/health', headers: HOST })).json();
    expect(health.generation).toMatchObject({ available: false, reason: 'PROVIDER_CONFIG_ERROR' });
    expect(health.generation.message).toContain('lyria-3.5');
    await app.close();
    await rm(tmp, { recursive: true, force: true });
  });
});
