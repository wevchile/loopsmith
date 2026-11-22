import type { GenerateRequest, GenerateResult, ProviderCapabilities } from '@loopsmith/core';

export interface MusicProvider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
  generate(request: GenerateRequest): Promise<GenerateResult>;
  analyzeReference?(audioPath: string): Promise<string>;
}

export interface ProviderConfig {
  apiKey?: string;
  projectId?: string;
  location?: string;
}
