export type SoundType = 'SOUNDTRACK' | 'SFX' | 'VO' | 'AMBIENCE' | 'OTHER';
export const SOUND_TYPES: SoundType[] = ['SOUNDTRACK', 'SFX', 'VO', 'AMBIENCE', 'OTHER'];

export type TrackStatus = 'candidate' | 'chosen' | 'discarded';
export const TRACK_STATUSES: TrackStatus[] = ['candidate', 'chosen', 'discarded'];

export interface Project {
  id: string;
  name: string;
  path: string;
  context?: string;
  defaultVocalsEnabled: boolean;
  manifestPath?: string;
  manifestSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AudioTrack {
  id: string;
  name: string;
  path: string;
  type: SoundType;
  folder: string;
  source: 'local' | 'manifest';
  duration?: number;
  isGenerated: boolean;
  generationId?: string;
  generation?: {
    status: TrackStatus;
    originalTrackId?: string;
    notes?: string;
    tags?: string[];
    prompt: string;
    model: string;
    timestamp: string;
  };
  exists?: boolean;
  loopMarkers?: { start: number; end: number };
}

export interface GenerationHistory {
  id: string;
  prompt: string;
  composedPrompt: string;
  model: string;
  vocalsEnabled: boolean;
  referenceTrackId?: string;
  referenceDescription?: string;
  lyrics?: string;
  structure?: string;
  context?: string;
  refinedPrompt?: string;
  finalPrompt?: string;
  refinement?: { status: 'refined' | 'skipped' | 'failed'; model?: string; error?: string };
  audio?: {
    requestedSeconds?: number;
    generatedSeconds?: number;
    finalSeconds?: number;
    trimmed: boolean;
    trimMethod?: 'ffmpeg' | 'js';
    untrimmedPath?: string;
    note?: string;
  };
  timestamp: string;
  outputPath: string;
  outputTrackId?: string;
  status?: TrackStatus;
  originalTrackId?: string;
  notes?: string;
  tags?: string[];
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
}

export interface Health {
  status: string;
  apiKeyConfigured: boolean;
  generation: {
    available: boolean;
    model?: string;
    providerId?: string;
    maxDurationSeconds?: number;
    fixedDurationSeconds?: number;
    trimToDuration?: boolean;
    promptRefine?: { enabled: boolean; model: string };
    reason?: string;
    message?: string;
  };
  allowedRoots: string[];
}

export interface ManifestEntry {
  id: string;
  name: string;
  type: SoundType;
  folder: string;
  relativePath: string;
}

export interface ManifestPreview {
  manifestPath: string;
  isFirstLink: boolean;
  entryCount: number;
  gameRepo: string;
  missingFiles: string[];
  summary: { added: number; removed: number; renamed: number; moved: number; updated: number; unchanged: number; hasChanges: boolean };
  diff: {
    added: ManifestEntry[];
    removed: ManifestEntry[];
    renamed: Array<{ old: ManifestEntry; new: ManifestEntry }>;
    moved: Array<{ old: ManifestEntry; new: ManifestEntry }>;
    updated: Array<{ old: ManifestEntry; new: ManifestEntry }>;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // Non JSON response (for example the dev proxy cannot reach the server).
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(body.error || `${res.status} ${res.statusText}`, res.status, body.code);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  health: () => request<Health>('/api/health'),

  listProjects: () => request<{ projects: Project[] }>('/api/projects').then((d) => d.projects),
  createProject: (body: { name: string; context?: string; defaultVocalsEnabled?: boolean; rootIndex?: number }) =>
    request<{ project: Project }>('/api/projects', { method: 'POST', json: body }).then((d) => d.project),
  updateProject: (id: string, body: { name?: string; context?: string; defaultVocalsEnabled?: boolean }) =>
    request<{ project: Project }>(`/api/projects/${enc(id)}`, { method: 'PUT', json: body }).then((d) => d.project),
  unlinkProject: (id: string) => request(`/api/projects/${enc(id)}`, { method: 'DELETE' }),

  tracks: (id: string) => request<{ tracks: AudioTrack[] }>(`/api/projects/${enc(id)}/tracks`).then((d) => d.tracks),
  history: (id: string) =>
    request<{ history: GenerationHistory[] }>(`/api/projects/${enc(id)}/history`).then((d) => d.history),
  downloadUrl: (projectId: string, trackId: string) => `/api/projects/${enc(projectId)}/download?trackId=${enc(trackId)}`,
  updateGeneration: (
    projectId: string,
    genId: string,
    body: { status?: TrackStatus; originalTrackId?: string | null; notes?: string; tags?: string[] }
  ) => request<{ entry: GenerationHistory; demoted: string[] }>(`/api/projects/${enc(projectId)}/generations/${enc(genId)}`, { method: 'PATCH', json: body }),
  renameGeneration: (projectId: string, genId: string, name: string) =>
    request<{ entry: GenerationHistory }>(`/api/projects/${enc(projectId)}/generations/${enc(genId)}/rename`, { method: 'POST', json: { name } }),
  moveGeneration: (projectId: string, genId: string, folder: string) =>
    request<{ entry: GenerationHistory }>(`/api/projects/${enc(projectId)}/generations/${enc(genId)}/move`, { method: 'POST', json: { folder } }),
  duplicateGeneration: (projectId: string, genId: string) =>
    request<{ entry: GenerationHistory }>(`/api/projects/${enc(projectId)}/generations/${enc(genId)}/duplicate`, { method: 'POST' }),
  deleteGeneration: (projectId: string, genId: string) =>
    request(`/api/projects/${enc(projectId)}/generations/${enc(genId)}`, { method: 'DELETE' }),
  audioUrl: (projectId: string, trackId: string) => `/api/projects/${enc(projectId)}/audio?trackId=${enc(trackId)}`,

  folders: (id: string) => request<{ tree: FolderNode }>(`/api/projects/${enc(id)}/folders`).then((d) => d.tree),
  createFolder: (id: string, parent: string, name: string) =>
    request(`/api/projects/${enc(id)}/folders`, { method: 'POST', json: { parent, name } }),
  renameFolder: (id: string, path: string, newName: string) =>
    request(`/api/projects/${enc(id)}/folders`, { method: 'PATCH', json: { path, newName } }),
  deleteFolder: (id: string, path: string, recursive: boolean) =>
    request(`/api/projects/${enc(id)}/folders?path=${enc(path)}&recursive=${recursive}`, { method: 'DELETE' }),

  previewManifest: (projectId: string, manifestPath?: string) =>
    request<ManifestPreview>('/api/manifest/preview', { method: 'POST', json: { projectId, manifestPath } }),
  applyManifest: (projectId: string, manifestPath?: string) =>
    request<ManifestPreview & { project: Project }>('/api/manifest/apply', { method: 'POST', json: { projectId, manifestPath } }),
  unlinkManifest: (projectId: string) =>
    request<{ project: Project }>(`/api/projects/${enc(projectId)}/manifest`, { method: 'DELETE' }).then((d) => d.project),

  generate: (body: {
    projectId: string;
    prompt: string;
    vocalsEnabled: boolean;
    duration?: number;
    referenceTrackId?: string;
    outputFolder: string;
    refinePrompt?: boolean;
  }) => request<{ entry: GenerationHistory }>('/api/generate', { method: 'POST', json: body }).then((d) => d.entry),
};
