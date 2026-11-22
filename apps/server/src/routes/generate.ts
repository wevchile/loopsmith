import type { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import path from 'node:path';
import type { Storage } from '../storage.js';
import type { ProviderRegistry } from '@loopsmith/providers';
import type { GenerationHistory } from '@loopsmith/core';

export const generateRoutes: FastifyPluginAsync<{
  storage: Storage;
  providerRegistry: ProviderRegistry;
  allowedRoots: string[];
}> = async (fastify, opts) => {
  const { storage, providerRegistry, allowedRoots } = opts;

  fastify.post<{
    Body: {
      projectId: string;
      providerId: string;
      prompt: string;
      vocalsEnabled?: boolean;
      duration?: number;
      referenceTrackPath?: string;
      outputFolder?: string;
      outputName?: string;
    };
  }>('/generate', async (request, reply) => {
    const {
      projectId,
      providerId,
      prompt,
      vocalsEnabled,
      duration,
      referenceTrackPath,
      outputFolder = 'SOUNDTRACK',
      outputName,
    } = request.body;

    if (!prompt || prompt.trim() === '') {
      return reply.code(400).send({ error: 'Prompt is required' });
    }

    let project = null;
    for (const root of allowedRoots) {
      const projects = await storage.listProjects(root);
      project = projects.find(p => p.id === projectId);
      if (project) break;
    }

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const provider = providerRegistry.getProvider(providerId);
    if (!provider) {
      return reply.code(400).send({ error: 'Provider not found' });
    }

    try {
      let composedPrompt = prompt;
      let referenceDescription: string | undefined;

      if (referenceTrackPath && provider.analyzeReference) {
        if (!storage.isPathAllowed(referenceTrackPath)) {
          return reply.code(400).send({ error: 'Reference track path not allowed' });
        }

        try {
          referenceDescription = await provider.analyzeReference(referenceTrackPath);
          composedPrompt = `${referenceDescription}\n\nVariation request: ${prompt}`;
        } catch (error) {
          fastify.log.warn(`Reference analysis failed: ${error}`);
        }
      }

      if (project.context) {
        composedPrompt = `${project.context}\n\n${composedPrompt}`;
      }

      const finalVocalsEnabled = vocalsEnabled ?? project.defaultVocalsEnabled;

      const result = await provider.generate({
        prompt: composedPrompt,
        vocalsEnabled: finalVocalsEnabled,
        duration,
      });

      const generationId = nanoid();
      const timestamp = new Date().toISOString();
      const filename = outputName || `generated_${Date.now()}.${result.format}`;
      const outputPath = path.join(project.path, outputFolder, filename);

      await storage.writeAudioFile(outputPath, result.audioData);

      const historyEntry: GenerationHistory = {
        id: generationId,
        projectId,
        prompt,
        composedPrompt,
        model: provider.name,
        parameters: {},
        vocalsEnabled: finalVocalsEnabled,
        referenceTrackId: referenceTrackPath,
        timestamp,
        outputPath,
      };

      await storage.addHistoryEntry(project.path, historyEntry);

      return {
        success: true,
        generationId,
        outputPath,
        lyrics: result.lyrics,
        referenceDescription,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Generation failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.get('/providers', async (request, reply) => {
    const providers = providerRegistry.listProviders();
    return {
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        capabilities: p.capabilities,
      })),
    };
  });
};
