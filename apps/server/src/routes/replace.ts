import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Storage } from '../storage.js';
import { HttpError } from '../storage.js';
import { applyChosenRule } from './ai-tracks.js';
import type { ReplaceService } from '../replace-service.js';

/**
 * "Reemplazar original" and its revert. These are the only routes that write into a game repository,
 * and they require an explicit confirmation in the body.
 */

const replaceSchema = z
  .object({
    confirm: z.literal(true),
    /** Backup name shown in the preview; the request fails if it changed in between. */
    expectedBackupName: z.string().min(1).max(260).optional(),
  })
  .strict();
const revertSchema = z.object({ confirm: z.literal(true) }).strict();
const entryIdSchema = z.string().min(1).max(300);

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw Object.assign(new HttpError(400, 'Invalid request body', 'VALIDATION_ERROR'), { details: result.error.errors });
  }
  return result.data;
}

function entryIdOf(raw: string): string {
  const result = entryIdSchema.safeParse(raw.startsWith('manifest:') ? raw.slice('manifest:'.length) : raw);
  if (!result.success) throw new HttpError(400, 'Invalid original id', 'VALIDATION_ERROR');
  return result.data;
}

export const replaceRoutes: FastifyPluginAsync<{ storage: Storage; replaceService: ReplaceService }> = async (
  fastify,
  { storage, replaceService }
) => {
  type GenParams = { id: string; genId: string };
  type EntryParams = { id: string; entryId: string };

  // What would happen: source, target, backup name and format conversion. Nothing is modified.
  fastify.get<{ Params: GenParams }>('/projects/:id/generations/:genId/replace-original', async (request) => {
    const project = await storage.getProject(request.params.id);
    return { preview: await replaceService.preview(project, request.params.genId) };
  });

  fastify.post<{ Params: GenParams }>('/projects/:id/generations/:genId/replace-original', async (request) => {
    const project = await storage.getProject(request.params.id);
    const body = parse(replaceSchema, request.body);
    const result = await replaceService.replace(project, request.params.genId, body.expectedBackupName);
    // The track now in the game is the chosen one for its original.
    const demoted = await storage
      .updateHistory(project.path, (history) => {
        const entry = history.find((h) => h.id === request.params.genId);
        if (!entry) return [];
        entry.status = 'chosen';
        entry.updatedAt = new Date().toISOString();
        return applyChosenRule(history, entry);
      })
      .catch(() => []);
    return { ...result, demoted };
  });

  fastify.get<{ Params: { id: string } }>('/projects/:id/replacements', async (request) => {
    const project = await storage.getProject(request.params.id);
    return { replacements: await replaceService.readRecords(project.path) };
  });

  fastify.get<{ Params: EntryParams }>('/projects/:id/originals/:entryId/revert', async (request) => {
    const project = await storage.getProject(request.params.id);
    return { preview: await replaceService.revertPreview(project, entryIdOf(request.params.entryId)) };
  });

  fastify.post<{ Params: EntryParams }>('/projects/:id/originals/:entryId/revert', async (request) => {
    const project = await storage.getProject(request.params.id);
    parse(revertSchema, request.body);
    return replaceService.revert(project, entryIdOf(request.params.entryId));
  });
};
