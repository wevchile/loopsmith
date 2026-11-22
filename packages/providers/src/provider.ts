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
  /** Optional: rewrite the request into a better prompt for this provider's model. */
  refinePrompt?(input: Omit<RefineInput, 'lyriaModel'>): Promise<{ prompt: string; model: string }>;
}

export interface ProviderConfig {
  /** Gemini API key from https://aistudio.google.com/api-keys */
  apiKey?: string;
  /** Lyria model id. Defaults to DEFAULT_LYRIA_MODEL. */
  lyriaModel?: string;
  /** Gemini model used to describe reference tracks. Defaults to DEFAULT_ANALYSIS_MODEL. */
  analysisModel?: string;
  /** Gemini model that writes the Lyria prompt. Defaults to DEFAULT_REFINE_MODEL. */
  refineModel?: string;
  /** Gemini API version. Defaults to DEFAULT_API_VERSION ("v1beta"), required by Lyria. */
  apiVersion?: string;
  /** Output format requested from Lyria. Defaults to "mp3". */
  outputFormat?: 'mp3' | 'wav';
}
