import path from 'node:path';
import { DEFAULT_ANALYSIS_MODEL, DEFAULT_API_VERSION, DEFAULT_LYRIA_MODEL, DEFAULT_REFINE_MODEL } from '@loopsmith/providers';

export interface Config {
  port: number;
  /** Always 127.0.0.1: the API is only reachable from this computer. */
  host: '127.0.0.1';
  repoRoot: string;
  /** Absolute folders where projects can be created, read and written. */
  allowedRoots: string[];
  geminiApiKey?: string;
  lyriaModel: string;
  analysisModel: string;
  /** Rewrite prompts with a Gemini text model before calling Lyria (default on; can be skipped per generation). */
  promptRefine: boolean;
  refineModel: string;
  geminiApiVersion: string;
  outputFormat: 'mp3' | 'wav';
  /** Cut generated audio to the requested duration (Lyria has no duration parameter). */
  trimToDuration: boolean;
  /** Keep the untouched model output in <project>/.loopsmith-untrimmed when trimming. */
  keepUntrimmed: boolean;
  fadeOutSeconds: number;
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
  const ffmpegEnv = env.LOOPSMITH_FFMPEG?.trim();
  const port = Number.parseInt(env.LOOPSMITH_SERVER_PORT || '3001', 10);

  return {
    port: Number.isFinite(port) ? port : 3001,
    host: '127.0.0.1',
    repoRoot,
    allowedRoots,
    geminiApiKey: cleanApiKey(env.GEMINI_API_KEY),
    lyriaModel: env.LYRIA_MODEL?.trim() || DEFAULT_LYRIA_MODEL,
    analysisModel: env.GEMINI_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL,
    promptRefine: flag(env.LOOPSMITH_PROMPT_REFINE, true),
    refineModel: env.LOOPSMITH_REFINE_MODEL?.trim() || DEFAULT_REFINE_MODEL,
    geminiApiVersion: env.GEMINI_API_VERSION?.trim() || DEFAULT_API_VERSION,
    outputFormat: env.LYRIA_OUTPUT_FORMAT?.trim().toLowerCase() === 'wav' ? 'wav' : 'mp3',
    trimToDuration: flag(env.LOOPSMITH_TRIM_TO_DURATION, true),
    keepUntrimmed: flag(env.LOOPSMITH_KEEP_UNTRIMMED, true),
    fadeOutSeconds: Number.isFinite(fade) && fade >= 0 ? Math.min(fade, 10) : 1.5,
    ffmpegPath: ffmpegEnv && ['false', 'off', 'none', '0'].includes(ffmpegEnv.toLowerCase()) ? false : ffmpegEnv || 'ffmpeg',
  };
}
