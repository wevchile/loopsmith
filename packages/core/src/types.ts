export type SoundType = 'SOUNDTRACK' | 'SFX' | 'VO' | 'AMBIENCE' | 'OTHER';

export interface Project {
  id: string;
  name: string;
  path: string;
  context?: string;
  defaultVocalsEnabled: boolean;
  manifestPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationHistory {
  id: string;
  projectId: string;
  prompt: string;
  composedPrompt: string;
  model: string;
  parameters: Record<string, unknown>;
  seed?: string;
  vocalsEnabled: boolean;
  referenceTrackId?: string;
  timestamp: string;
  outputPath: string;
}

export interface AudioTrack {
  id: string;
  name: string;
  path: string;
  type: SoundType;
  folder: string;
  duration?: number;
  isGenerated: boolean;
  generationId?: string;
  hash?: string;
}

export interface ManifestEntry {
  id: string;
  name: string;
  type: SoundType;
  folder: string;
  relativePath: string;
  hash?: string;
  duration?: number;
  loopMarkers?: {
    start: number;
    end: number;
  };
}

export interface Manifest {
  version: string;
  gameRepo: string;
  entries: ManifestEntry[];
  lastSync?: string;
}

export interface ManifestSyncDiff {
  added: ManifestEntry[];
  removed: ManifestEntry[];
  renamed: Array<{ old: ManifestEntry; new: ManifestEntry }>;
  moved: Array<{ old: ManifestEntry; new: ManifestEntry }>;
}

export interface ProviderCapabilities {
  supportsInstrumental: boolean;
  supportsVocals: boolean;
  supportsReferenceAudio: boolean;
  maxDurationSeconds: number;
  outputFormats: string[];
}

export interface GenerateRequest {
  prompt: string;
  vocalsEnabled: boolean;
  duration?: number;
  referenceTrack?: {
    path: string;
    prompt?: string;
  };
  seed?: string;
  parameters?: Record<string, unknown>;
}

export interface GenerateResult {
  audioData: Buffer;
  format: string;
  lyrics?: string;
  metadata?: Record<string, unknown>;
}
