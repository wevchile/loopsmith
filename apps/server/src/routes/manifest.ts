import type { FastifyPluginAsync } from 'fastify';
import { HttpError, type Storage } from '../storage.js';
import { applyManifest, previewManifest } from '../manifest-service.js';

interface ManifestBody {
  projectId?: string;
  /** Absolute path to the manifest .json. Defaults to the manifest already linked to the project. */
  manifestPath?: string;
}

export const manifestRoutes: FastifyPluginAsync<{ storage: Storage }> = async (fastify, { storage }) => {
  async function resolveTarget(body: ManifestBody | undefined) {
    const project = await storage.getProject(body?.projectId ?? '');
    const manifestPath = body?.manifestPath?.trim() || project.manifestPath;
    if (!manifestPath) throw new HttpError(400, 'manifestPath is required', 'MANIFEST_PATH_REQUIRED');
    return { project, manifestPath };
  }

  // Shows what would change (added, removed, renamed, moved, updated) without touching anything.
  fastify.post<{ Body: ManifestBody }>('/manifest/preview', async (request) => {
    const { project, manifestPath } = await resolveTarget(request.body);
    return previewManifest(storage, project, manifestPath);
  });

  // Links (first time) or re-syncs the manifest. Generated audio is never modified.
  const apply = async (request: { body: ManifestBody }) => {
    const { project, manifestPath } = await resolveTarget(request.body);
    return applyManifest(storage, project, manifestPath);
  };
  fastify.post<{ Body: ManifestBody }>('/manifest/apply', apply);
  fastify.post<{ Body: ManifestBody }>('/manifest/link', apply);

  fastify.delete<{ Params: { id: string } }>('/projects/:id/manifest', async (request) => {
    const project = await storage.getProject(request.params.id);
    await storage.deleteManifestSnapshot(project.path);
    const updated = { ...project, manifestPath: undefined, manifestSyncedAt: undefined, updatedAt: new Date().toISOString() };
    await storage.writeProject(updated);
    return { project: updated };
  });
};
