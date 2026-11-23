import path from 'node:path';
import type { PromptMode } from '@loopsmith/core';
import {
  DEFAULT_ANALYSIS_MODEL,
  DEFAULT_API_VERSION,
  DEFAULT_LOOP_SECONDS,
  DEFAULT_LYRIA_MODEL_LONG,
  DEFAULT_LYRIA_MODEL_SHORT,
  DEFAULT_REFINE_MODEL,
} from '@loopsmith/providers';

export interface Config {
  port: number;
  /** Always 127.0.0.1: the API is only reachable from this computer. */
  host: '127.0.0.1';
  repoRoot: string;
  /** Absolute folders where projects can be created, read and written. */
  allowedRoots: string[];
  geminiApiKey?: string;
  /** LYRIA_MODEL: one model for every generation. Empty = pick lyriaModelShort or lyriaModelLong by duration. */
  lyriaModel?: string;
  /** LYRIA_MODEL_SHORT: loops up to 29 s (default lyria-3-clip-preview). */
  lyriaModelShort: string;
  /** LYRIA_MODEL_LONG: longer tracks and pieces without a duration (default lyria-3.5). */
  lyriaModelLong: string;
  analysisModel: string;
  /** LOOPSMITH_PROMPT_MODE: "direct" (default, prompt frame built in code) or "refine" ("Pulir con IA" on by default). */
  promptMode: PromptMode;
  refineModel: string;
  geminiApiVersion: string;
  outputFormat: 'mp3' | 'wav';
  /** Cut generated audio to the requested duration (Lyria has no duration parameter). */
  trimToDuration: boolean;
  /** Keep the untouched model output in <project>/.loopsmith-untrimmed when trimming. */
  keepUntrimmed: boolean;
  /** Fade-out used for tracks "with an ending" (Con final). */
  fadeOutSeconds: number;
  /** Loop length when the duration field is empty in loop mode. */
  defaultLoopSeconds: number;
  /** Crossfade at the loop point, in seconds. */
  loopSeamSeconds: number;
  /** ffmpeg executable used for trimming; false disables it (pure JavaScript fallback). */
  ffmpegPath: string | false;
}

function flag(value: string | undefined, fallback: boolean): boolean {
  const v = value?.trim().toLowerCase();
  if (!v) return fallback;
  return !['0', 'false', 'no', 'off'].includes(v);
}

const PLACEHOLDER_KEYS = new Set(['', 'your_gemini_api_key_here', 'changeme']);

function cleanApiKey(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value || PLACEHOLDER_KEYS.has(value) || value.startsWith('your_')) return undefined;
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv, repoRoot: string): Config {
  const rootsEnv = env.LOOPSMITH_ROOTS?.trim() || './loopsmith-data';
  const allowedRoots = [
    ...new Set(
      rootsEnv
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => path.resolve(repoRoot, r))
    ),
  ];

  const fade = Number.parseFloat(env.LOOPSMITH_FADE_OUT_SECONDS || '1.5');
  const loopSeconds = Number.parseFloat(env.LOOPSMITH_DEFAULT_LOOP_SECONDS || String(DEFAULT_LOOP_SECONDS));
  const seam = Number.parseFloat(env.LOOPSMITH_LOOP_SEAM_SECONDS || '0.25');
  const mode = env.LOOPSMITH_PROMPT_MODE?.trim().toLowerCase();
  const ffmpegEnv = env.LOOPSMITH_FFMPEG?.trim();
  const port = Number.parseInt(env.LOOPSMITH_SERVER_PORT || '3001', 10);

  return {
    port: Number.isFinite(port) ? port : 3001,
    host: '127.0.0.1',
    repoRoot,
    allowedRoots,
    geminiApiKey: cleanApiKey(env.GEMINI_API_KEY),
    lyriaModel: env.LYRIA_MODEL?.trim() || undefined,
    lyriaModelShort: env.LYRIA_MODEL_SHORT?.trim() || DEFAULT_LYRIA_MODEL_SHORT,
    lyriaModelLong: env.LYRIA_MODEL_LONG?.trim() || DEFAULT_LYRIA_MODEL_LONG,
    analysisModel: env.GEMINI_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL,
    promptMode: mode === 'refine' ? 'refine' : 'direct',
    refineModel: env.LOOPSMITH_REFINE_MODEL?.trim() || DEFAULT_REFINE_MODEL,
    geminiApiVersion: env.GEMINI_API_VERSION?.trim() || DEFAULT_API_VERSION,
    outputFormat: env.LYRIA_OUTPUT_FORMAT?.trim().toLowerCase() === 'wav' ? 'wav' : 'mp3',
    trimToDuration: flag(env.LOOPSMITH_TRIM_TO_DURATION, true),
    keepUntrimmed: flag(env.LOOPSMITH_KEEP_UNTRIMMED, true),
    fadeOutSeconds: Number.isFinite(fade) && fade >= 0 ? Math.min(fade, 10) : 1.5,
    defaultLoopSeconds: Number.isFinite(loopSeconds) && loopSeconds >= 1 ? Math.min(loopSeconds, 240) : DEFAULT_LOOP_SECONDS,
    loopSeamSeconds: Number.isFinite(seam) && seam >= 0.01 ? Math.min(seam, 2) : 0.25,
    ffmpegPath: ffmpegEnv && ['false', 'off', 'none', '0'].includes(ffmpegEnv.toLowerCase()) ? false : ffmpegEnv || 'ffmpeg',
  };
}
