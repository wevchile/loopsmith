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

export interface GeneratedAudioInfo {
  /** Length asked for in the duration field (seconds). */
  requestedSeconds?: number;
  /** Length the model actually returned (seconds). */
  generatedSeconds?: number;
  /** Length of the saved file (seconds). */
  finalSeconds?: number;
  /** True when the saved file was cut to the requested length. */
  trimmed: boolean;
  /** "ffmpeg" (re-encoded with a fade-out) or "js" (pure JavaScript cut). */
  trimMethod?: 'ffmpeg' | 'js';
  fadeOutSeconds?: number;
  /** Untouched model output, kept next to the project in a hidden folder. */
  untrimmedPath?: string;
  /** Why trimming was skipped or failed, if it was. */
  note?: string;
}

export interface PromptRefinementInfo {
  /** refined = the model wrote the prompt; skipped = turned off; failed = error, raw prompt used. */
  status: 'refined' | 'skipped' | 'failed';
  model?: string;
  error?: string;
}

export interface GenerationHistory {
  id: string;
  projectId: string;
  prompt: string;
  /** Raw combination of project context, base track description and user prompt (used when refinement is off or fails). */
  composedPrompt: string;
  model: string;
  parameters: Record<string, unknown>;
  seed?: string;
  vocalsEnabled: boolean;
  referenceTrackId?: string;
  referenceDescription?: string;
  lyrics?: string;
  /** Raw structure text returned by the model (for example "[[A0]] [[B1]]"). */
  structure?: string;
  /** Project context that was available to the prompt (lower priority than the user prompt). */
  context?: string;
  /** Prompt written by the refinement model, when refinement ran. */
  refinedPrompt?: string;
  /** Exact text sent to the music model. */
  finalPrompt?: string;
  refinement?: PromptRefinementInfo;
  /** Requested vs generated vs saved length, and how the file was trimmed. */
  audio?: GeneratedAudioInfo;
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
  /** Set when the model always returns this many seconds, whatever the prompt says. */
  fixedDurationSeconds?: number;
  outputFormats: string[];
}

export type AudioOutputFormat = 'mp3' | 'wav';

export interface GenerateRequest {
  prompt: string;
  /** When false (the default) the provider must produce an instrumental-only track. */
  vocalsEnabled: boolean;
  /** Desired duration in seconds. Providers may treat it as a hint. */
  duration?: number;
  /** The prompt was already refined: send it as is (no extra length or instrumental text). */
  promptIsFinal?: boolean;
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
  /** Real lyrics only (section markers such as "[[A0]]" removed). */
  lyrics?: string;
  /** Raw structure text returned by the model (section markers or JSON). */
  structure?: string;
  metadata?: Record<string, unknown>;
}
