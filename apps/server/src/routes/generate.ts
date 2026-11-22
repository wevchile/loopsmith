import type { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import path from 'node:path';
import type { GenerationHistory } from '@loopsmith/core';
import { toSafeName } from '@loopsmith/core';
import type { ProviderRegistry } from '@loopsmith/providers';
import { HttpError, toPosix, type Storage } from '../storage.js';
import { resolveTrackPath } from '../manifest-service.js';

export const API_KEY_MISSING_MESSAGE =
  'GEMINI_API_KEY is not configured. Copy .env.example to .env, add your key from https://aistudio.google.com/api-keys and restart Loopsmith.';

interface GenerateBody {
  projectId?: string;
  providerId?: string;
  prompt?: string;
  vocalsEnabled?: boolean;
  duration?: number;
  /** Track used as the base of a variant ("local:..." or "manifest:..."). */
  referenceTrackId?: string;
  outputFolder?: string;
  outputName?: string;
}

/** Joins project context, optional reference description and the user prompt. */
export function composePrompt(prompt: string, context?: string, referenceDescription?: string): string {
  const parts: string[] = [];
  if (context?.trim()) parts.push(`Project style and context: ${context.trim()}`);
  if (referenceDescription) {
    parts.push(`Base track description: ${referenceDescription}`);
    parts.push(`Create a new variation of that base track with these changes: ${prompt.trim()}`);
  } else {
    parts.push(prompt.trim());
  }
  return parts.join('\n\n');
}

export const generateRoutes: FastifyPluginAsync<{ storage: Storage; providerRegistry: ProviderRegistry }> = async (
  fastify,
  { storage, providerRegistry }
) => {
  fastify.get('/providers', async () => ({
    providers: providerRegistry.listProviders().map((p) => ({
      id: p.id,
      name: p.name,
      model: p.model,
      capabilities: p.capabilities,
    })),
  }));

  fastify.post<{ Body: GenerateBody }>('/generate', async (request, reply) => {
    const body = request.body ?? {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) throw new HttpError(400, 'Prompt is required', 'PROMPT_REQUIRED');
    if (prompt.length > 8000) throw new HttpError(400, 'Prompt is too long', 'PROMPT_TOO_LONG');

    const project = await storage.getProject(body.projectId ?? '');

    const provider = body.providerId ? providerRegistry.getProvider(body.providerId) : providerRegistry.getDefaultProvider();
    if (!provider) {
      if (providerRegistry.listProviders().length === 0) {
        throw new HttpError(503, API_KEY_MISSING_MESSAGE, 'API_KEY_MISSING');
      }
      throw new HttpError(400, 'Provider not found', 'PROVIDER_NOT_FOUND');
    }

    const outputFolderRel = (body.outputFolder ?? 'SOUNDTRACK').replace(/\\/g, '/');
    const outputDir = storage.resolveProjectPath(project, outputFolderRel);

    let referenceDescription: string | undefined;
    if (body.referenceTrackId) {
      if (!provider.analyzeReference) {
        throw new HttpError(400, 'This provider cannot use a reference track', 'REFERENCE_NOT_SUPPORTED');
      }
      const referencePath = await resolveTrackPath(storage, project, body.referenceTrackId);
      try {
        referenceDescription = await provider.analyzeReference(referencePath);
      } catch (error) {
        throw new HttpError(502, (error as Error).message, 'REFERENCE_ANALYSIS_FAILED');
      }
    }

    const vocalsEnabled = body.vocalsEnabled ?? project.defaultVocalsEnabled ?? false;
    const duration =
      typeof body.duration === 'number' && body.duration > 0
        ? Math.min(body.duration, provider.capabilities.maxDurationSeconds)
        : undefined;
    const composedPrompt = composePrompt(prompt, project.context, referenceDescription);

    let result;
    try {
      result = await provider.generate({ prompt: composedPrompt, vocalsEnabled, duration });
    } catch (error) {
      request.log.error(error);
      throw new HttpError(502, (error as Error).message, 'GENERATION_FAILED');
    }

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
    const baseName = toSafeName(body.outputName?.replace(/\.[a-z0-9]+$/i, '') || prompt.slice(0, 40), 'track');
    let outputPath = path.join(outputDir, `${baseName}_${stamp}.${result.format}`);
    for (let i = 2; await storage.fileExists(outputPath); i++) {
      outputPath = path.join(outputDir, `${baseName}_${stamp}_${i}.${result.format}`);
    }
    await storage.writeAudioFile(outputPath, result.audioData);

    const entry: GenerationHistory = {
      id: nanoid(10),
      projectId: project.id,
      prompt,
      composedPrompt,
      model: provider.model,
      parameters: { providerId: provider.id, duration, outputFolder: outputFolderRel, format: result.format },
      vocalsEnabled,
      referenceTrackId: body.referenceTrackId,
      referenceDescription,
      lyrics: result.lyrics,
      timestamp: new Date().toISOString(),
      outputPath,
      outputTrackId: `local:${toPosix(path.relative(project.path, outputPath))}`,
    };
    await storage.addHistoryEntry(project.path, entry);

    return reply.code(201).send({ success: true, entry });
  });
};
