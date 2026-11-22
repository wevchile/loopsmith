import type { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import path from 'node:path';
import type { Project } from '@loopsmith/core';
import { isValidEntryName, toSafeName } from '@loopsmith/core';
import { HttpError, SOUND_TYPES, type Storage } from '../storage.js';
import { listManifestTracks } from '../manifest-service.js';

interface ProjectBody {
  name?: string;
  rootIndex?: number;
  context?: string;
  defaultVocalsEnabled?: boolean;
}

function cleanContext(context: unknown): string | undefined {
  if (typeof context !== 'string') return undefined;
  const trimmed = context.trim();
  return trimmed ? trimmed.slice(0, 4000) : undefined;
}

function requireName(name: unknown): string {
  if (typeof name !== 'string' || !isValidEntryName(name)) {
    throw new HttpError(400, 'Invalid folder name', 'INVALID_NAME');
  }
  return name;
}

export const projectsRoutes: FastifyPluginAsync<{ storage: Storage }> = async (fastify, { storage }) => {
  fastify.get('/projects', async () => ({ projects: await storage.listProjects() }));

  fastify.post<{ Body: ProjectBody }>('/projects', async (request, reply) => {
    const { name, rootIndex = 0, context, defaultVocalsEnabled = false } = request.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      throw new HttpError(400, 'Project name is required', 'NAME_REQUIRED');
    }
    const roots = storage.roots;
    if (!Number.isInteger(rootIndex) || rootIndex < 0 || rootIndex >= roots.length) {
      throw new HttpError(400, 'Invalid root index', 'INVALID_ROOT');
    }

    const projectPath = path.join(roots[rootIndex], toSafeName(name.trim(), 'project'));
    if (await storage.readProject(projectPath)) {
      throw new HttpError(409, 'A project already exists in that folder', 'PROJECT_EXISTS');
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: nanoid(10),
      name: name.trim().slice(0, 120),
      path: projectPath,
      context: cleanContext(context),
      defaultVocalsEnabled: Boolean(defaultVocalsEnabled),
      createdAt: now,
      updatedAt: now,
    };
    await storage.writeProject(project);
    for (const folder of SOUND_TYPES) {
      await storage.ensureDir(path.join(projectPath, folder));
    }
    return reply.code(201).send({ project });
  });

  fastify.get<{ Params: { id: string } }>('/projects/:id', async (request) => ({
    project: await storage.getProject(request.params.id),
  }));

  // Only these fields can be changed by the client. The folder path is never taken from the request.
  fastify.put<{ Params: { id: string }; Body: Omit<ProjectBody, 'rootIndex'> }>('/projects/:id', async (request) => {
    const project = await storage.getProject(request.params.id);
    const body = request.body ?? {};
    const updated: Project = { ...project, updatedAt: new Date().toISOString() };
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) throw new HttpError(400, 'Project name is required', 'NAME_REQUIRED');
      updated.name = body.name.trim().slice(0, 120);
    }
    if (body.context !== undefined) updated.context = cleanContext(body.context);
    if (body.defaultVocalsEnabled !== undefined) updated.defaultVocalsEnabled = Boolean(body.defaultVocalsEnabled);
    await storage.writeProject(updated);
    return { project: updated };
  });

  // Removes Loopsmith metadata only; audio files and folders stay on disk.
  fastify.delete<{ Params: { id: string } }>('/projects/:id', async (request) => {
    const project = await storage.getProject(request.params.id);
    await storage.unlinkProject(project);
    return { success: true };
  });

  fastify.get<{ Params: { id: string } }>('/projects/:id/tracks', async (request) => {
    const project = await storage.getProject(request.params.id);
    const history = await storage.readHistory(project.path);
    const byPath = new Map(history.map((h) => [path.resolve(h.outputPath).toLowerCase(), h]));
    const local = (await storage.listLocalTracks(project, new Set(byPath.keys()))).map((track) => {
      const h = byPath.get(path.resolve(track.path).toLowerCase());
      if (!h) return track;
      return {
        ...track,
        generationId: h.id,
        generation: {
          status: h.status ?? 'candidate',
          originalTrackId: h.originalTrackId,
          notes: h.notes,
          tags: h.tags,
          prompt: h.prompt,
          model: h.model,
          timestamp: h.timestamp,
        },
      };
    });
    const manifest = await listManifestTracks(storage, project);
    return { tracks: [...local, ...manifest] };
  });

  fastify.get<{ Params: { id: string } }>('/projects/:id/history', async (request) => {
    const project = await storage.getProject(request.params.id);
    const history = await storage.readHistory(project.path);
    return { history: [...history].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) };
  });

  // ---------- folders CRUD (paths are relative to the project folder) ----------

  fastify.get<{ Params: { id: string } }>('/projects/:id/folders', async (request) => {
    const project = await storage.getProject(request.params.id);
    return { tree: await storage.listFolderTree(project) };
  });

  fastify.post<{ Params: { id: string }; Body: { parent?: string; name?: string } }>(
    '/projects/:id/folders',
    async (request, reply) => {
      const project = await storage.getProject(request.params.id);
      const name = requireName(request.body?.name);
      const created = await storage.createFolder(project, request.body?.parent ?? '', name);
      return reply.code(201).send({ path: created });
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { path?: string; newName?: string } }>(
    '/projects/:id/folders',
    async (request) => {
      const project = await storage.getProject(request.params.id);
      const newName = requireName(request.body?.newName);
      const renamed = await storage.renameFolder(project, request.body?.path ?? '', newName);
      return { path: renamed };
    }
  );

  fastify.delete<{ Params: { id: string }; Querystring: { path?: string; recursive?: string } }>(
    '/projects/:id/folders',
    async (request) => {
      const project = await storage.getProject(request.params.id);
      await storage.deleteFolder(project, request.query.path ?? '', request.query.recursive === 'true');
      return { success: true };
    }
  );
};
