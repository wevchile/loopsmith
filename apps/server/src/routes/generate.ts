import type { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { GeneratedAudioInfo, GenerationHistory } from '@loopsmith/core';
import { toSafeName } from '@loopsmith/core';
import type { ProviderRegistry } from '@loopsmith/providers';
import { HttpError, toPosix, type Storage } from '../storage.js';
import type { AudioTools } from '../audio-length.js';
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

export interface TrimOptions {
  enabled: boolean;
  keepUntrimmed: boolean;
  fadeOutSeconds: number;
}

/** Hidden project folder (skipped by the track scanner) that keeps the untouched model output. */
export const UNTRIMMED_DIR = '.loopsmith-untrimmed';
/** Outputs up to this many seconds longer than requested are kept as they are. */
const TRIM_TOLERANCE_SECONDS = 0.5;

export interface GenerateRoutesOptions {
  storage: Storage;
  providerRegistry: ProviderRegistry;
  audioTools?: AudioTools;
  trim?: TrimOptions;
}

const round = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 100) / 100);

/**
 * Lyria has no duration parameter, so a requested duration is enforced here: when the file is
 * longer than asked, it is cut to that length with a short fade-out. The original can be kept.
 */
async function enforceDuration(
  storage: Storage,
  projectPath: string,
  outputPath: string,
  requestedSeconds: number | undefined,
  audioTools: AudioTools | undefined,
  trim: TrimOptions | undefined
): Promise<GeneratedAudioInfo> {
  const generatedSeconds = audioTools ? await audioTools.measure(outputPath).catch(() => undefined) : undefined;
  const info: GeneratedAudioInfo = { requestedSeconds, generatedSeconds: round(generatedSeconds), finalSeconds: round(generatedSeconds), trimmed: false };
  if (!requestedSeconds || !audioTools || !trim?.enabled) return info;
  if (generatedSeconds === undefined) return { ...info, note: 'Could not measure the generated audio; it was not trimmed.' };
  if (generatedSeconds <= requestedSeconds + TRIM_TOLERANCE_SECONDS) return info;

  const name = path.basename(outputPath);
  const untrimmedPath = path.join(projectPath, UNTRIMMED_DIR, name);
  storage.validatePath(untrimmedPath);
  await storage.ensureDir(path.dirname(untrimmedPath));
  await rename(outputPath, untrimmedPath);
  try {
    const result = await audioTools.trim(untrimmedPath, outputPath, requestedSeconds, trim.fadeOutSeconds);
    const finalSeconds = await audioTools.measure(outputPath).catch(() => undefined);
    if (!trim.keepUntrimmed) await rm(untrimmedPath, { force: true });
    return {
      ...info,
      finalSeconds: round(finalSeconds),
      trimmed: true,
      trimMethod: result.method,
      fadeOutSeconds: round(result.fadeOutSeconds),
      ...(trim.keepUntrimmed ? { untrimmedPath } : {}),
    };
  } catch (error) {
    await rm(outputPath, { force: true });
    await rename(untrimmedPath, outputPath);
    return { ...info, note: `Trimming failed, kept the full file: ${(error as Error).message}` };
  }
}

export const generateRoutes: FastifyPluginAsync<GenerateRoutesOptions> = async (
  fastify,
  { storage, providerRegistry, audioTools, trim }
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
        if (providerRegistry.errors.length > 0) {
          throw new HttpError(503, providerRegistry.errors[0]!, 'PROVIDER_CONFIG_ERROR');
        }
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
    const audio = await enforceDuration(storage, project.path, outputPath, duration, audioTools, trim);
    if (audio.note) request.log.warn(audio.note);

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
      structure: result.structure,
      audio,
      timestamp: new Date().toISOString(),
      outputPath,
      outputTrackId: `local:${toPosix(path.relative(project.path, outputPath))}`,
    };
    await storage.addHistoryEntry(project.path, entry);

    return reply.code(201).send({ success: true, entry });
  });
};
