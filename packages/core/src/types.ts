export type SoundType = 'SOUNDTRACK' | 'SFX' | 'VO' | 'AMBIENCE' | 'OTHER';

export interface Project {
  id: string;
  name: string;
  path: string;
  context?: string;
  defaultVocalsEnabled: boolean;
  /** Absolute path of the linked manifest file (optional). */
  manifestPath?: string;
  /** ISO timestamp of the last time the manifest was applied. */
  manifestSyncedAt?: string;
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
  referenceDescription?: string;
  lyrics?: string;
  timestamp: string;
  /** Absolute path of the generated file. */
  outputPath: string;
  /** Track id (relative to the project folder) of the generated file. */
  outputTrackId?: string;
}

export type TrackSource = 'local' | 'manifest';

export interface AudioTrack {
  /** Stable id: "local:<relative path>" or "manifest:<entry id>". */
  id: string;
  name: string;
  /** Absolute path on disk. */
  path: string;
  type: SoundType;
  /** Folder relative to the project folder (local) or as declared in the manifest. */
  folder: string;
  source: TrackSource;
  duration?: number;
  isGenerated: boolean;
  generationId?: string;
  hash?: string;
  loopMarkers?: { start: number; end: number };
  /** False when the file referenced by a manifest entry does not exist on disk. */
  exists?: boolean;
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
  /** Same entry (same id and path) whose type, hash, duration or loop markers changed. */
  updated: Array<{ old: ManifestEntry; new: ManifestEntry }>;
  unchanged: number;
}

export interface ProviderCapabilities {
  supportsInstrumental: boolean;
  supportsVocals: boolean;
  supportsReferenceAudio: boolean;
  maxDurationSeconds: number;
  outputFormats: string[];
}

export type AudioOutputFormat = 'mp3' | 'wav';

export interface GenerateRequest {
  prompt: string;
  /** When false (the default) the provider must produce an instrumental-only track. */
  vocalsEnabled: boolean;
  /** Desired duration in seconds. Providers may treat it as a hint. */
  duration?: number;
  outputFormat?: AudioOutputFormat;
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
