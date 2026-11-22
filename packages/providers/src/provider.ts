import type { GenerateRequest, GenerateResult, ProviderCapabilities } from '@loopsmith/core';
import type { RefineInput } from './prompt-refiner.js';

export interface MusicProvider {
  id: string;
  name: string;
  /** Model identifier used by the provider (for example "lyria-3.5"). */
  model: string;
  capabilities: ProviderCapabilities;
  generate(request: GenerateRequest): Promise<GenerateResult>;
  /** Optional: describe an existing audio file so it can be used as the base of a variant. */
  analyzeReference?(audioPath: string): Promise<string>;
  /** Optional: lightly rewrite the musical direction (wrapped in the prompt frame by the caller). */
  refinePrompt?(input: RefineInput): Promise<{ prompt: string; model: string }>;
  /** Optional: model to use for a duration (for example a short-clip model for loops). */
  selectModel?(durationSeconds?: number): string;
  /** Optional: models picked by duration, for display. */
  modelShort?: string;
  modelLong?: string;
  modelOverride?: string;
  shortMaxSeconds?: number;
}

export interface ProviderConfig {
  /** Gemini API key from https://aistudio.google.com/api-keys */
  apiKey?: string;
  /** LYRIA_MODEL: one Lyria model for every request (overrides the short/long pair). */
  lyriaModel?: string;
  /** LYRIA_MODEL_SHORT: model for loops up to 29 s. Defaults to DEFAULT_LYRIA_MODEL_SHORT. */
  lyriaModelShort?: string;
  /** LYRIA_MODEL_LONG: model for longer tracks. Defaults to DEFAULT_LYRIA_MODEL_LONG. */
  lyriaModelLong?: string;
  /** Gemini model used to describe reference tracks. Defaults to DEFAULT_ANALYSIS_MODEL. */
  analysisModel?: string;
  /** Gemini model that writes the Lyria prompt. Defaults to DEFAULT_REFINE_MODEL. */
  refineModel?: string;
  /** Gemini API version. Defaults to DEFAULT_API_VERSION ("v1beta"), required by Lyria. */
  apiVersion?: string;
  /** Output format requested from Lyria. Defaults to "mp3". */
  outputFormat?: 'mp3' | 'wav';
}
