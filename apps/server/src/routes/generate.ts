import type { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { GeneratedAudioInfo, GenerationHistory, PromptRefinementInfo } from '@loopsmith/core';
import { toSafeName } from '@loopsmith/core';
import { trackTypeFromFolder, type ProviderRegistry } from '@loopsmith/providers';
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
  /** Per generation switch for prompt refinement (defaults to LOOPSMITH_PROMPT_REFINE). */
  refinePrompt?: boolean;
}

/**
 * Joins the user prompt, optional base track description and project context into the raw prompt
 * used when refinement is off or fails. The user prompt comes first and wins over the context.
 */
export function composePrompt(prompt: string, context?: string, referenceDescription?: string): string {
  const parts: string[] = [];
  if (referenceDescription) {
    parts.push(`Create a new variation of this base track with these changes: ${prompt.trim()}`);
    parts.push(`Base track description: ${referenceDescription}`);
  } else {
    parts.push(prompt.trim());
  }
  if (context?.trim()) {
    parts.push(`Project style and context (lower priority; ignore anything that conflicts with the request above): ${context.trim()}`);
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
  /** Default for prompt refinement when the request does not say. */
  promptRefine?: boolean;
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
  { storage, providerRegistry, audioTools, trim, promptRefine = true }
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

    // Prompt refinement: a text model writes the final prompt. The user prompt always wins over
    // the project context (see prompt-refiner.ts). Any failure falls back to the raw prompt.
    const wantsRefine = body.refinePrompt ?? promptRefine;
    let refinedPrompt: string | undefined;
    let refinement: PromptRefinementInfo = { status: 'skipped' };
    if (wantsRefine && provider.refinePrompt) {
      try {
        const refined = await provider.refinePrompt({
          userPrompt: prompt,
          projectContext: project.context,
          durationSeconds: duration,
          vocalsEnabled,
          referenceDescription,
          trackType: trackTypeFromFolder(outputFolderRel),
          outputFolder: outputFolderRel,
        });
        refinedPrompt = refined.prompt;
        refinement = { status: 'refined', model: refined.model };
      } catch (error) {
        const message = (error as Error).message;
        request.log.warn(`Prompt refinement failed, using the raw prompt: ${message}`);
        refinement = { status: 'failed', error: message.slice(0, 500) };
      }
    }

    let result;
    try {
      result = refinedPrompt
        ? await provider.generate({ prompt: refinedPrompt, promptIsFinal: true, vocalsEnabled, duration })
        : await provider.generate({ prompt: composedPrompt, vocalsEnabled, duration });
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
    // A track generated from an original (manifest) sound competes to replace it. A variant of an
    // AI track that is already linked to an original inherits that link.
    let originalTrackId: string | undefined;
    if (body.referenceTrackId?.startsWith('manifest:')) {
      originalTrackId = body.referenceTrackId;
    } else if (body.referenceTrackId) {
      const base = (await storage.readHistory(project.path)).find((h) => h.outputTrackId === body.referenceTrackId);
      originalTrackId = base?.originalTrackId;
    }

    const audio = await enforceDuration(storage, project.path, outputPath, duration, audioTools, trim);
    if (audio.note) request.log.warn(audio.note);

    const entry: GenerationHistory = {
      id: nanoid(10),
      projectId: project.id,
      prompt,
      context: project.context?.trim() || undefined,
      composedPrompt,
      refinedPrompt,
      finalPrompt: typeof result.metadata?.prompt === 'string' ? result.metadata.prompt : (refinedPrompt ?? composedPrompt),
      refinement,
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
      status: 'candidate',
      originalTrackId,
    };
    await storage.addHistoryEntry(project.path, entry);

    return reply.code(201).send({ success: true, entry });
  });
};
