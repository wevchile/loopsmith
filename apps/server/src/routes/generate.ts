import type { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { EndingMode, GeneratedAudioInfo, GenerationHistory, PromptMode, PromptRefinementInfo } from '@loopsmith/core';
import { ENDING_MODES, toSafeName } from '@loopsmith/core';
import {
  DEFAULT_LOOP_SECONDS,
  buildFramedPrompt,
  defaultEndingFor,
  trackTypeFromFolder,
  type ProviderRegistry,
} from '@loopsmith/providers';
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
  /** Seconds. Empty in loop mode = LOOPSMITH_DEFAULT_LOOP_SECONDS (16). */
  duration?: number;
  /** Track used as the base of a variant ("local:..." or "manifest:..."). */
  referenceTrackId?: string;
  outputFolder?: string;
  outputName?: string;
  /** "Pulir con IA" for this generation: true = refine, false = direct. Defaults to LOOPSMITH_PROMPT_MODE. */
  refinePrompt?: boolean;
  /** "loop" (seamless loop, default for music and ambience) or "ending" (Con final: natural ending and fade-out). */
  ending?: string;
}

export interface TrimOptions {
  enabled: boolean;
  keepUntrimmed: boolean;
  /** Fade-out for tracks with an ending. */
  fadeOutSeconds: number;
  /** Crossfade at the loop point. */
  seamSeconds: number;
}

/** Hidden project folder (skipped by the track scanner) that keeps the untouched model output. */
export const UNTRIMMED_DIR = '.loopsmith-untrimmed';
/** Outputs up to this many seconds longer than requested are kept as they are (ending mode). */
const TRIM_TOLERANCE_SECONDS = 0.5;
/** Shortest usable loop seam when the model output is barely longer than the loop. */
const MIN_SEAM_SECONDS = 0.05;

export interface GenerateRoutesOptions {
  storage: Storage;
  providerRegistry: ProviderRegistry;
  audioTools?: AudioTools;
  trim?: TrimOptions;
  /** Prompt mode when the request does not say (LOOPSMITH_PROMPT_MODE). */
  promptMode?: PromptMode;
  /** Loop length when the duration field is empty in loop mode. */
  defaultLoopSeconds?: number;
}

const round = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 100) / 100);

/**
 * Lyria has no duration parameter, so the length is enforced here.
 * - loop: a seamless loop of exactly N seconds (the audio past N is crossfaded into the start),
 *   written as 16-bit 44.1 kHz WAV. Needs ffmpeg; without it, or when the model output is too
 *   short for a seam, it falls back to a fade-out cut or keeps the file.
 * - ending: cut to N seconds with a short fade-out (WAV with ffmpeg).
 * The untouched model output is kept in UNTRIMMED_DIR unless LOOPSMITH_KEEP_UNTRIMMED=false.
 * Returns the audio info and the final file path (its extension can change to .wav).
 */
export async function finalizeAudio(
  storage: Storage,
  projectPath: string,
  rawPath: string,
  requestedSeconds: number | undefined,
  ending: EndingMode,
  audioTools: AudioTools | undefined,
  trim: TrimOptions | undefined
): Promise<{ info: GeneratedAudioInfo; outputPath: string }> {
  const generatedSeconds = audioTools ? await audioTools.measure(rawPath).catch(() => undefined) : undefined;
  const info: GeneratedAudioInfo = { requestedSeconds, generatedSeconds: round(generatedSeconds), finalSeconds: round(generatedSeconds), trimmed: false };
  const keep = { info, outputPath: rawPath };
  if (!requestedSeconds || !audioTools || !trim?.enabled) return keep;
  if (generatedSeconds === undefined) return { ...keep, info: { ...info, note: 'Could not measure the generated audio; it was not trimmed.' } };

  const hasFfmpeg = await audioTools.hasFfmpeg();
  const spare = generatedSeconds - requestedSeconds;
  let method: 'loop-seam' | 'fade-out';
  let seam = 0;
  let note: string | undefined;
  if (ending === 'loop') {
    if (spare < MIN_SEAM_SECONDS) {
      return { ...keep, info: { ...info, note: `The model returned ${round(generatedSeconds)} s, not more than the ${requestedSeconds} s loop; kept as is.` } };
    }
    if (hasFfmpeg) {
      method = 'loop-seam';
      seam = Math.min(trim.seamSeconds, spare - 0.01);
      if (seam < trim.seamSeconds) note = `Short model output: loop seam reduced to ${round(seam)} s.`;
    } else {
      method = 'fade-out';
      note = 'ffmpeg not found: the loop seam needs ffmpeg, so the track was cut with a fade-out instead.';
    }
  } else {
    if (spare <= TRIM_TOLERANCE_SECONDS) return keep;
    method = 'fade-out';
  }

  const rawName = path.basename(rawPath);
  const untrimmedPath = path.join(projectPath, UNTRIMMED_DIR, rawName);
  storage.validatePath(untrimmedPath);
  await storage.ensureDir(path.dirname(untrimmedPath));
  await rename(rawPath, untrimmedPath);
  // With ffmpeg the result is lossless WAV (decoded once); the JS fallback keeps the model format.
  let outputPath = hasFfmpeg ? rawPath.replace(/\.[a-z0-9]+$/i, '.wav') : rawPath;
  if (outputPath !== rawPath) {
    for (let i = 2; await storage.fileExists(outputPath); i++) outputPath = rawPath.replace(/\.[a-z0-9]+$/i, `_${i}.wav`);
  }
  try {
    const result: Partial<GeneratedAudioInfo> = {};
    if (method === 'loop-seam') {
      await audioTools.loopSeam(untrimmedPath, outputPath, requestedSeconds, seam);
      Object.assign(result, { trimMethod: 'ffmpeg', seamSeconds: round(seam) });
    } else {
      const r = await audioTools.trim(untrimmedPath, outputPath, requestedSeconds, trim.fadeOutSeconds);
      Object.assign(result, { trimMethod: r.method, fadeOutSeconds: round(r.fadeOutSeconds) });
    }
    const finalSeconds = await audioTools.measure(outputPath).catch(() => undefined);
    if (!trim.keepUntrimmed) await rm(untrimmedPath, { force: true });
    return {
      outputPath,
      info: {
        ...info,
        ...result,
        finalSeconds: round(finalSeconds),
        trimmed: true,
        lengthMethod: method,
        ...(trim.keepUntrimmed ? { untrimmedPath } : {}),
        ...(note ? { note } : {}),
      },
    };
  } catch (error) {
    await rm(outputPath, { force: true });
    await rename(untrimmedPath, rawPath);
    return { ...keep, info: { ...info, note: `Trimming failed, kept the full file: ${(error as Error).message}` } };
  }
}

export const generateRoutes: FastifyPluginAsync<GenerateRoutesOptions> = async (
  fastify,
  { storage, providerRegistry, audioTools, trim, promptMode: defaultPromptMode = 'direct', defaultLoopSeconds = DEFAULT_LOOP_SECONDS }
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
    const trackType = trackTypeFromFolder(outputFolderRel);
    const ending: EndingMode = (ENDING_MODES as readonly string[]).includes(body.ending ?? '')
      ? (body.ending as EndingMode)
      : defaultEndingFor(trackType);
    const duration =
      typeof body.duration === 'number' && body.duration > 0
        ? Math.min(body.duration, provider.capabilities.maxDurationSeconds)
        : ending === 'loop'
          ? defaultLoopSeconds
          : undefined;
    const model = provider.selectModel?.(duration) ?? provider.model;
    const frame = { context: project.context, referenceDescription, durationSeconds: duration, vocalsEnabled, ending, trackType };
    // Direct mode: the user prompt verbatim inside a fixed frame (it is also the fallback of refine mode).
    const composedPrompt = buildFramedPrompt({ ...frame, direction: prompt });

    // Refine mode ("Pulir con IA"): a text model lightly rewrites the musical direction, then the
    // same frame is added in code. The user prompt wins over the context. Failures fall back to direct.
    const promptMode: PromptMode = body.refinePrompt === true ? 'refine' : body.refinePrompt === false ? 'direct' : defaultPromptMode;
    let refinedPrompt: string | undefined;
    let refinement: PromptRefinementInfo = { status: 'skipped' };
    if (promptMode === 'refine' && provider.refinePrompt) {
      try {
        const refined = await provider.refinePrompt({
          userPrompt: prompt,
          projectContext: project.context,
          durationSeconds: duration,
          vocalsEnabled,
          referenceDescription,
          trackType,
          outputFolder: outputFolderRel,
        });
        refinedPrompt = refined.prompt;
        refinement = { status: 'refined', model: refined.model };
      } catch (error) {
        const message = (error as Error).message;
        request.log.warn(`Prompt refinement failed, using the direct prompt: ${message}`);
        refinement = { status: 'failed', error: message.slice(0, 500) };
      }
    }
    const finalPrompt = refinedPrompt
      ? buildFramedPrompt({ ...frame, context: undefined, referenceDescription: undefined, direction: refinedPrompt })
      : composedPrompt;

    let result;
    try {
      result = await provider.generate({ prompt: finalPrompt, promptIsFinal: true, vocalsEnabled, duration, model });
    } catch (error) {
      request.log.error(error);
      throw new HttpError(502, (error as Error).message, 'GENERATION_FAILED');
    }

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
    const baseName = toSafeName(body.outputName?.replace(/\.[a-z0-9]+$/i, '') || prompt.slice(0, 40), 'track');
    let rawPath = path.join(outputDir, `${baseName}_${stamp}.${result.format}`);
    for (let i = 2; (await storage.fileExists(rawPath)) || (await storage.fileExists(rawPath.replace(/\.[a-z0-9]+$/i, '.wav'))); i++) {
      rawPath = path.join(outputDir, `${baseName}_${stamp}_${i}.${result.format}`);
    }
    await storage.writeAudioFile(rawPath, result.audioData);
    // A track generated from an original (manifest) sound competes to replace it. A variant of an
    // AI track that is already linked to an original inherits that link.
    let originalTrackId: string | undefined;
    if (body.referenceTrackId?.startsWith('manifest:')) {
      originalTrackId = body.referenceTrackId;
    } else if (body.referenceTrackId) {
      const base = (await storage.readHistory(project.path)).find((h) => h.outputTrackId === body.referenceTrackId);
      originalTrackId = base?.originalTrackId;
    }

    const { info: audio, outputPath } = await finalizeAudio(storage, project.path, rawPath, duration, ending, audioTools, trim);
    if (audio.note) request.log.warn(audio.note);

    const entry: GenerationHistory = {
      id: nanoid(10),
      projectId: project.id,
      prompt,
      context: project.context?.trim() || undefined,
      composedPrompt,
      refinedPrompt,
      finalPrompt: typeof result.metadata?.prompt === 'string' ? result.metadata.prompt : finalPrompt,
      refinement,
      promptMode,
      ending,
      model: typeof result.metadata?.model === 'string' ? result.metadata.model : model,
      parameters: { providerId: provider.id, duration, outputFolder: outputFolderRel, format: path.extname(outputPath).slice(1), modelFormat: result.format },
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
