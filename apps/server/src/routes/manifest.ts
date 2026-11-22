import type { FastifyPluginAsync } from 'fastify';
import type { Storage } from '../storage.js';
import { manifestSchema } from '@loopsmith/core';
import { computeManifestDiff } from '@loopsmith/core';

export const manifestRoutes: FastifyPluginAsync<{
  storage: Storage;
  allowedRoots: string[];
}> = async (fastify, opts) => {
  const { storage, allowedRoots } = opts;

  fastify.post<{
    Body: {
      projectId: string;
      manifestPath: string;
    };
  }>('/manifest/preview', async (request, reply) => {
    const { projectId, manifestPath } = request.body;

    let project = null;
    for (const root of allowedRoots) {
      const projects = await storage.listProjects(root);
      project = projects.find(p => p.id === projectId);
      if (project) break;
    }

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const newManifest = await storage.readManifest(manifestPath);
    if (!newManifest) {
      return reply.code(404).send({ error: 'Manifest not found' });
    }

    const validationResult = manifestSchema.safeParse(newManifest);
    if (!validationResult.success) {
      return reply.code(400).send({
        error: 'Invalid manifest format',
        details: validationResult.error.errors,
      });
    }

    const oldManifestPath = project.manifestPath;
    const oldManifest = oldManifestPath ? await storage.readManifest(oldManifestPath) : null;

    const diff = computeManifestDiff(oldManifest, newManifest);

    return {
      diff,
      manifest: newManifest,
    };
  });

  fastify.post<{
    Body: {
      projectId: string;
      manifestPath: string;
    };
  }>('/manifest/link', async (request, reply) => {
    const { projectId, manifestPath } = request.body;

    let project = null;
    for (const root of allowedRoots) {
      const projects = await storage.listProjects(root);
      project = projects.find(p => p.id === projectId);
      if (project) break;
    }

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const manifest = await storage.readManifest(manifestPath);
    if (!manifest) {
      return reply.code(404).send({ error: 'Manifest not found' });
    }

    const validationResult = manifestSchema.safeParse(manifest);
    if (!validationResult.success) {
      return reply.code(400).send({
        error: 'Invalid manifest format',
        details: validationResult.error.errors,
      });
    }

    const updated = {
      ...project,
      manifestPath,
      updatedAt: new Date().toISOString(),
    };

    await storage.writeProject(updated);

    return { success: true, project: updated };
  });
};
