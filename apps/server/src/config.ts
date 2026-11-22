import path from 'node:path';
import { DEFAULT_ANALYSIS_MODEL, DEFAULT_API_VERSION, DEFAULT_LYRIA_MODEL } from '@loopsmith/providers';

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
  geminiApiVersion: string;
  outputFormat: 'mp3' | 'wav';
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

  const port = Number.parseInt(env.LOOPSMITH_SERVER_PORT || '3001', 10);

  return {
    port: Number.isFinite(port) ? port : 3001,
    host: '127.0.0.1',
    repoRoot,
    allowedRoots,
    geminiApiKey: cleanApiKey(env.GEMINI_API_KEY),
    lyriaModel: env.LYRIA_MODEL?.trim() || DEFAULT_LYRIA_MODEL,
    analysisModel: env.GEMINI_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL,
    geminiApiVersion: env.GEMINI_API_VERSION?.trim() || DEFAULT_API_VERSION,
    outputFormat: env.LYRIA_OUTPUT_FORMAT?.trim().toLowerCase() === 'wav' ? 'wav' : 'mp3',
  };
}
