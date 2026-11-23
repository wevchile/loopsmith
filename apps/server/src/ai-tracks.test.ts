import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile, access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ProviderRegistry, type MusicProvider } from '@loopsmith/providers';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { AudioTools } from './audio-length.js';

const HOST = { host: '127.0.0.1:3001' };

function wav(frames = 16000): Buffer {
  const dataSize = frames * 2;
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

describe('AI track review and CRUD', () => {
  let tmp: string;
  let gameDir: string;
  let app: FastifyInstance;
  let projectId: string;
  let projectPath: string;
  const originalBytes = wav(4000);

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: HOST, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const gen = async (payload: Record<string, unknown>) => {
    const res = await call('POST', '/api/generate', { projectId, ...payload });
    expect(res.statusCode).toBe(201);
    return res.json().entry;
  };
  const tracks = async () => (await call('GET', `/api/projects/${projectId}/tracks`)).json().tracks as Array<Record<string, any>>;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'loopsmith-ai-'));
    gameDir = path.join(tmp, 'game');
    await mkdir(path.join(gameDir, 'music'), { recursive: true });
    await writeFile(path.join(gameDir, 'music', 'boss.wav'), originalBytes);
    await writeFile(
      path.join(gameDir, 'loopsmith-manifest.json'),
      JSON.stringify({ version: '1.0', gameRepo: 'game', entries: [{ id: 'boss', name: 'boss.wav', type: 'SOUNDTRACK', folder: 'music', relativePath: 'music/boss.wav' }] })
    );
    const fake: MusicProvider = {
      id: 'fake',
      name: 'Fake',
      model: 'fake-1',
      capabilities: { supportsInstrumental: true, supportsVocals: true, supportsReferenceAudio: false, maxDurationSeconds: 60, outputFormats: ['wav'] },
      async generate() {
        return { audioData: wav(), format: 'wav' };
      },
      async analyzeReference() {
        return 'boss music';
      },
    };
    const registry = new ProviderRegistry();
    registry.registerProvider(fake);
    app = await buildApp(loadConfig({ LOOPSMITH_ROOTS: './data' }, tmp), { logger: false, providerRegistry: registry, audioTools: new AudioTools(false) });
    const project = (await call('POST', '/api/projects', { name: 'AI' })).json().project;
    projectId = project.id;
    projectPath = project.path;
    expect((await call('POST', '/api/manifest/apply', { projectId, manifestPath: path.join(gameDir, 'loopsmith-manifest.json') })).statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await rm(tmp, { recursive: true, force: true });
  });

  it('creates candidates, auto-links variants of an original and keeps one chosen per original', async () => {
    const a = await gen({ prompt: 'boss A', referenceTrackId: 'manifest:boss' });
    expect(a).toMatchObject({ status: 'candidate', originalTrackId: 'manifest:boss' });
    // A variant of a linked AI track inherits the link.
    const b = await gen({ prompt: 'boss B', referenceTrackId: a.outputTrackId });
    expect(b.originalTrackId).toBe('manifest:boss');
    const free = await gen({ prompt: 'menu' });
    expect(free.originalTrackId).toBeUndefined();

    const chooseA = await call('PATCH', `/api/projects/${projectId}/generations/${a.id}`, { status: 'chosen' });
    expect(chooseA.statusCode).toBe(200);
    const chooseB = (await call('PATCH', `/api/projects/${projectId}/generations/${b.id}`, { status: 'chosen' })).json();
    expect(chooseB.demoted).toEqual([a.id]);

    const list = await tracks();
    const byGen = (id: string) => list.find((t) => t.generationId === id)!;
    expect(byGen(a.id).generation.status).toBe('candidate');
    expect(byGen(b.id).generation.status).toBe('chosen');
    expect(list.find((t) => t.id === 'manifest:boss')).toMatchObject({ source: 'manifest', isGenerated: false });

    // Unlinked tracks can have any status, several chosen allowed.
    expect((await call('PATCH', `/api/projects/${projectId}/generations/${free.id}`, { status: 'discarded', notes: ' calm ', tags: ['menu', 'menu', 'loop'] })).json().entry).toMatchObject({
      status: 'discarded',
      notes: 'calm',
      tags: ['menu', 'loop'],
    });
    // Link manually, then unlink.
    expect((await call('PATCH', `/api/projects/${projectId}/generations/${free.id}`, { originalTrackId: 'manifest:boss' })).json().entry.originalTrackId).toBe('manifest:boss');
    expect((await call('PATCH', `/api/projects/${projectId}/generations/${free.id}`, { originalTrackId: null })).json().entry.originalTrackId).toBeUndefined();
  });

  it('validates input with zod and rejects unknown originals', async () => {
    const [entry] = (await call('GET', `/api/projects/${projectId}/history`)).json().history;
    const bad = await call('PATCH', `/api/projects/${projectId}/generations/${entry.id}`, { status: 'winner' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('VALIDATION_ERROR');
    expect((await call('PATCH', `/api/projects/${projectId}/generations/${entry.id}`, { path: 'C:/x' })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/projects/${projectId}/generations/${entry.id}`, { originalTrackId: 'manifest:nope' })).json().code).toBe('ORIGINAL_NOT_FOUND');
    expect((await call('PATCH', `/api/projects/${projectId}/generations/${entry.id}`, { originalTrackId: 'local:SOUNDTRACK/x.wav' })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/projects/${projectId}/generations/missing`, { status: 'chosen' })).statusCode).toBe(404);
  });

  it('renames, moves, duplicates and deletes AI tracks inside the project only', async () => {
    const e = await gen({ prompt: 'crud me', duration: 1 });
    expect(e.audio.untrimmedPath).toBeTruthy();

    const renamed = (await call('POST', `/api/projects/${projectId}/generations/${e.id}/rename`, { name: 'Boss Fight v2' })).json().entry;
    expect(renamed.outputTrackId).toBe('local:SOUNDTRACK/Boss_Fight_v2.wav');
    await access(renamed.outputPath);
    expect(path.basename(renamed.audio.untrimmedPath)).toBe('Boss_Fight_v2.wav');
    await access(renamed.audio.untrimmedPath);

    for (const name of ['../evil', '..', 'a/b', 'CON']) {
      expect((await call('POST', `/api/projects/${projectId}/generations/${e.id}/rename`, { name })).statusCode, name).toBe(400);
    }
    const other = await gen({ prompt: 'other' });
    expect((await call('POST', `/api/projects/${projectId}/generations/${other.id}/rename`, { name: 'Boss_Fight_v2' })).statusCode).toBe(409);

    const moved = (await call('POST', `/api/projects/${projectId}/generations/${e.id}/move`, { folder: 'OTHER/new' })).json().entry;
    expect(moved.outputTrackId).toBe('local:OTHER/new/Boss_Fight_v2.wav');
    for (const folder of ['../../outside', '.loopsmith-untrimmed']) {
      expect((await call('POST', `/api/projects/${projectId}/generations/${e.id}/move`, { folder })).statusCode, folder).toBe(400);
    }

    const dup = await call('POST', `/api/projects/${projectId}/generations/${e.id}/duplicate`);
    expect(dup.statusCode).toBe(201);
    const copy = dup.json().entry;
    expect(copy).toMatchObject({ status: 'candidate', duplicatedFrom: e.id, outputTrackId: 'local:OTHER/new/Boss_Fight_v2_copy.wav' });
    expect(copy.id).not.toBe(e.id);

    const del = await call('DELETE', `/api/projects/${projectId}/generations/${e.id}`);
    expect(del.statusCode).toBe(200);
    await expect(access(moved.outputPath)).rejects.toThrow();
    await expect(access(renamed.audio.untrimmedPath)).rejects.toThrow();
    await access(copy.outputPath);
    const history = (await call('GET', `/api/projects/${projectId}/history`)).json().history;
    expect(history.some((h: { id: string }) => h.id === e.id)).toBe(false);
  });

  it('downloads any track as an attachment and never modifies originals', async () => {
    const res = await call('GET', `/api/projects/${projectId}/download?trackId=${encodeURIComponent('manifest:boss')}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment; filename="boss.wav"');
    expect(res.headers['content-type']).toBe('audio/wav');
    expect((await call('GET', `/api/projects/${projectId}/download?trackId=${encodeURIComponent('local:../../game/music/boss.wav')}`)).statusCode).toBe(400);
    expect(Buffer.compare(await readFile(path.join(gameDir, 'music', 'boss.wav')), originalBytes)).toBe(0);
    expect(await readdir(path.join(gameDir, 'music'))).toEqual(['boss.wav']);
  });

  it('reads old history entries as candidates (migration default)', async () => {
    const file = path.join(projectPath, 'history.json');
    const history = JSON.parse(await readFile(file, 'utf-8'));
    delete history[0].status;
    await writeFile(file, JSON.stringify(history));
    const read = (await call('GET', `/api/projects/${projectId}/history`)).json().history;
    expect(read.every((h: { status?: string }) => h.status)).toBe(true);
  });
});
