import type { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import path from 'node:path';
import type { Storage } from '../storage.js';
import type { Project } from '@loopsmith/core';

export const projectsRoutes: FastifyPluginAsync<{ storage: Storage; allowedRoots: string[] }> = async (fastify, opts) => {
  const { storage, allowedRoots } = opts;

  fastify.get('/projects', async (request, reply) => {
    const projects: Project[] = [];

    for (const root of allowedRoots) {
      const rootProjects = await storage.listProjects(root);
      projects.push(...rootProjects);
    }

    return { projects };
  });

  fastify.post<{
    Body: { name: string; rootIndex?: number; context?: string; defaultVocalsEnabled?: boolean };
  }>('/projects', async (request, reply) => {
    const { name, rootIndex = 0, context, defaultVocalsEnabled = false } = request.body;

    if (!name || name.trim() === '') {
      return reply.code(400).send({ error: 'Project name is required' });
    }

    if (rootIndex < 0 || rootIndex >= allowedRoots.length) {
      return reply.code(400).send({ error: 'Invalid root index' });
    }

    const projectId = nanoid();
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const projectPath = path.join(allowedRoots[rootIndex], sanitizedName);

    const project: Project = {
      id: projectId,
      name,
      path: projectPath,
      context,
      defaultVocalsEnabled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await storage.writeProject(project);

    const defaultFolders = ['SOUNDTRACK', 'SFX', 'VO', 'AMBIENCE', 'OTHER'];
    for (const folder of defaultFolders) {
      await storage.ensureDir(path.join(projectPath, folder));
    }

    return { project };
  });

  fastify.get<{
    Params: { id: string };
  }>('/projects/:id', async (request, reply) => {
    const { id } = request.params;

    for (const root of allowedRoots) {
      const projects = await storage.listProjects(root);
      const project = projects.find(p => p.id === id);
      if (project) {
        return { project };
      }
    }

    return reply.code(404).send({ error: 'Project not found' });
  });

  fastify.put<{
    Params: { id: string };
    Body: Partial<Pick<Project, 'name' | 'context' | 'defaultVocalsEnabled' | 'manifestPath'>>;
  }>('/projects/:id', async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;

    for (const root of allowedRoots) {
      const projects = await storage.listProjects(root);
      const project = projects.find(p => p.id === id);
      
      if (project) {
        const updated: Project = {
          ...project,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await storage.writeProject(updated);
        return { project: updated };
      }
    }

    return reply.code(404).send({ error: 'Project not found' });
  });

  fastify.get<{
    Params: { id: string };
  }>('/projects/:id/tracks', async (request, reply) => {
    const { id } = request.params;

    for (const root of allowedRoots) {
      const projects = await storage.listProjects(root);
      const project = projects.find(p => p.id === id);
      
      if (project) {
        const tracks = await storage.listAudioFiles(project.path);
        return { tracks };
      }
    }

    return reply.code(404).send({ error: 'Project not found' });
  });

  fastify.get<{
    Params: { id: string };
  }>('/projects/:id/history', async (request, reply) => {
    const { id } = request.params;

    for (const root of allowedRoots) {
      const projects = await storage.listProjects(root);
      const project = projects.find(p => p.id === id);
      
      if (project) {
        const history = await storage.readHistory(project.path);
        return { history };
      }
    }

    return reply.code(404).send({ error: 'Project not found' });
  });
};
