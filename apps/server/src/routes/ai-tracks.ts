import type { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import { createReadStream } from 'node:fs';
import { copyFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { GenerationHistory, Project } from '@loopsmith/core';
import { audioMimeType } from '@loopsmith/providers';
import { TRACK_STATUSES, isValidEntryName, toSafeName } from '@loopsmith/core';
import { HttpError, toPosix, type Storage } from '../storage.js';
import { resolveTrackPath } from '../manifest-service.js';
import { UNTRIMMED_DIR } from './generate.js';

/**
 * CRUD for AI generated tracks (entries of history.json). Originals from the manifest and other
 * local files are read-only: these routes only touch files recorded as Loopsmith generations.
 */

const statusSchema = z.enum(TRACK_STATUSES as unknown as [string, ...string[]]);
const updateSchema = z
  .object({
    status: statusSchema.optional(),
    /** "manifest:<entry id>" or null to unlink. */
    originalTrackId: z.string().startsWith('manifest:').max(300).nullable().optional(),
    notes: z.string().max(4000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .strict();
const renameSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine((n) => !/[\\/]/.test(n) && !n.includes('..'), 'Name must not contain path separators or ".."'),
  })
  .strict();
const moveSchema = z.object({ folder: z.string().max(500) }).strict();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw Object.assign(new HttpError(400, 'Invalid request body', 'VALIDATION_ERROR'), { details: result.error.errors });
  }
  return result.data;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function findEntry(history: GenerationHistory[], id: string): GenerationHistory {
  const entry = history.find((h) => h.id === id);
  if (!entry) throw new HttpError(404, 'Generated track not found', 'GENERATION_NOT_FOUND');
  return entry;
}

/** Makes sure an entry's file is inside the project before touching it. */
export function entryPath(storage: Storage, project: Project, entry: GenerationHistory): string {
  const rel = entry.outputTrackId?.startsWith('local:')
    ? entry.outputTrackId.slice('local:'.length)
    : toPosix(path.relative(project.path, entry.outputPath));
  return storage.resolveProjectPath(project, rel);
}

function untrimmedPathOf(storage: Storage, project: Project, entry: GenerationHistory): string | undefined {
  const p = entry.audio?.untrimmedPath;
  if (!p) return undefined;
  const resolved = storage.resolveProjectPath(project, toPosix(path.relative(project.path, p)));
  // Only files in the hidden untrimmed folder are ever removed or renamed.
  return path.basename(path.dirname(resolved)) === UNTRIMMED_DIR ? resolved : undefined;
}

function setLocation(project: Project, entry: GenerationHistory, absPath: string) {
  entry.outputPath = absPath;
  entry.outputTrackId = `local:${toPosix(path.relative(project.path, absPath))}`;
}

/** Checks that an original exists in the linked manifest snapshot. */
async function assertOriginal(storage: Storage, project: Project, trackId: string): Promise<void> {
  const snapshot = project.manifestPath ? await storage.readManifestSnapshot(project.path) : null;
  const id = trackId.slice('manifest:'.length);
  if (!snapshot?.entries.some((e) => e.id === id)) {
    throw new HttpError(400, 'The original track is not in the linked manifest', 'ORIGINAL_NOT_FOUND');
  }
}

/** Only one "chosen" track per original: choosing one demotes the previous chosen one to candidate. */
export function applyChosenRule(history: GenerationHistory[], entry: GenerationHistory): string[] {
  const demoted: string[] = [];
  if (entry.status !== 'chosen' || !entry.originalTrackId) return demoted;
  for (const other of history) {
    if (other.id !== entry.id && other.status === 'chosen' && other.originalTrackId === entry.originalTrackId) {
      other.status = 'candidate';
      other.updatedAt = new Date().toISOString();
      demoted.push(other.id);
    }
  }
  return demoted;
}

export const aiTrackRoutes: FastifyPluginAsync<{ storage: Storage }> = async (fastify, { storage }) => {
  type Params = { id: string; genId: string };

  fastify.patch<{ Params: Params }>('/projects/:id/generations/:genId', async (request) => {
    const project = await storage.getProject(request.params.id);
    const changes = parse(updateSchema, request.body);
    if (changes.originalTrackId) await assertOriginal(storage, project, changes.originalTrackId);
    return storage.updateHistory(project.path, (history) => {
      const entry = findEntry(history, request.params.genId);
      if (changes.status) entry.status = changes.status as GenerationHistory['status'];
      if (changes.originalTrackId !== undefined) entry.originalTrackId = changes.originalTrackId ?? undefined;
      if (changes.notes !== undefined) entry.notes = changes.notes.trim() || undefined;
      if (changes.tags !== undefined) entry.tags = [...new Set(changes.tags)];
      entry.updatedAt = new Date().toISOString();
      const demoted = applyChosenRule(history, entry);
      return { entry, demoted };
    });
  });

  fastify.post<{ Params: Params }>('/projects/:id/generations/:genId/rename', async (request) => {
    const project = await storage.getProject(request.params.id);
    const { name } = parse(renameSchema, request.body);
    return storage.updateHistory(project.path, async (history) => {
      const entry = findEntry(history, request.params.genId);
      const source = entryPath(storage, project, entry);
      const ext = path.extname(source);
      const base = name.replace(new RegExp(`${ext.replace('.', '\\.')}$`, 'i'), '');
      const safe = toSafeName(base, '');
      if (!safe || !isValidEntryName(`${safe}${ext}`)) throw new HttpError(400, 'Invalid file name', 'INVALID_NAME');
      const target = storage.resolveProjectPath(project, toPosix(path.join(path.relative(project.path, path.dirname(source)), `${safe}${ext}`)));
      const caseOnly = target !== source && target.toLowerCase() === source.toLowerCase() && process.platform !== 'linux';
      if (caseOnly) {
        // Case-only rename on a case-insensitive file system: go through a temporary name.
        await rename(source, `${source}.tmp-rename`);
        await rename(`${source}.tmp-rename`, target);
      } else if (target !== source) {
        if (await exists(target)) throw new HttpError(409, 'A file with that name already exists', 'FILE_EXISTS');
        await rename(source, target);
      }
      setLocation(project, entry, target);
      const untrimmed = untrimmedPathOf(storage, project, entry);
      if (untrimmed && (await exists(untrimmed))) {
        const newUntrimmed = path.join(path.dirname(untrimmed), path.basename(target));
        if (!(await exists(newUntrimmed))) {
          await rename(untrimmed, newUntrimmed);
          entry.audio = { ...entry.audio!, untrimmedPath: newUntrimmed };
        }
      }
      entry.updatedAt = new Date().toISOString();
      return { entry };
    });
  });

  fastify.post<{ Params: Params }>('/projects/:id/generations/:genId/move', async (request) => {
    const project = await storage.getProject(request.params.id);
    const { folder } = parse(moveSchema, request.body);
    const targetDir = storage.resolveProjectPath(project, folder.replace(/\\/g, '/'));
    if (path.basename(targetDir).startsWith('.')) throw new HttpError(400, 'Hidden folders are not allowed', 'PATH_NOT_ALLOWED');
    return storage.updateHistory(project.path, async (history) => {
      const entry = findEntry(history, request.params.genId);
      const source = entryPath(storage, project, entry);
      const target = path.join(targetDir, path.basename(source));
      storage.validatePath(target);
      if (target !== source) {
        if (await exists(target)) throw new HttpError(409, 'A file with that name already exists in that folder', 'FILE_EXISTS');
        await storage.ensureDir(targetDir);
        await rename(source, target);
        setLocation(project, entry, target);
      }
      entry.updatedAt = new Date().toISOString();
      return { entry };
    });
  });

  fastify.post<{ Params: Params }>('/projects/:id/generations/:genId/duplicate', async (request, reply) => {
    const project = await storage.getProject(request.params.id);
    const result = await storage.updateHistory(project.path, async (history) => {
      const entry = findEntry(history, request.params.genId);
      const source = entryPath(storage, project, entry);
      const ext = path.extname(source);
      const stem = path.basename(source, ext);
      let target = path.join(path.dirname(source), `${stem}_copy${ext}`);
      for (let i = 2; await exists(target); i++) target = path.join(path.dirname(source), `${stem}_copy${i}${ext}`);
      storage.validatePath(target);
      await copyFile(source, target);
      const now = new Date().toISOString();
      const copy: GenerationHistory = {
        ...structuredClone(entry),
        id: nanoid(10),
        status: 'candidate',
        duplicatedFrom: entry.id,
        timestamp: now,
        updatedAt: now,
      };
      if (copy.audio) delete copy.audio.untrimmedPath;
      setLocation(project, copy, target);
      history.push(copy);
      return { entry: copy };
    });
    return reply.code(201).send(result);
  });

  fastify.delete<{ Params: Params }>('/projects/:id/generations/:genId', async (request) => {
    const project = await storage.getProject(request.params.id);
    return storage.updateHistory(project.path, async (history) => {
      const index = history.findIndex((h) => h.id === request.params.genId);
      if (index < 0) throw new HttpError(404, 'Generated track not found', 'GENERATION_NOT_FOUND');
      const entry = history[index]!;
      await rm(entryPath(storage, project, entry), { force: true });
      const untrimmed = untrimmedPathOf(storage, project, entry);
      // Keep the untrimmed file if a duplicate still points to it.
      if (untrimmed && !history.some((h, i) => i !== index && h.audio?.untrimmedPath === entry.audio?.untrimmedPath)) {
        await rm(untrimmed, { force: true });
      }
      history.splice(index, 1);
      return { success: true, deletedId: entry.id };
    });
  });

  /** Downloads any track (AI, local or original) as an attachment. Nothing is modified. */
  fastify.get<{ Params: { id: string }; Querystring: { trackId?: string } }>('/projects/:id/download', async (request, reply) => {
    const project = await storage.getProject(request.params.id);
    const filePath = await resolveTrackPath(storage, project, request.query.trackId ?? '');
    const name = path.basename(filePath);
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    reply.header('Content-Type', audioMimeType(filePath));
    reply.header('Content-Length', (await stat(filePath)).size);
    reply.header('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    return reply.send(createReadStream(filePath));
  });
};
