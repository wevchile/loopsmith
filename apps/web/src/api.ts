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

export interface AudioTrack {
  id: string;
  name: string;
  path: string;
  type: string;
  folder: string;
  duration?: number;
  isGenerated: boolean;
  generationId?: string;
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

export interface Provider {
  id: string;
  name: string;
  capabilities: {
    supportsInstrumental: boolean;
    supportsVocals: boolean;
    supportsReferenceAudio: boolean;
    maxDurationSeconds: number;
    outputFormats: string[];
  };
}

export interface HealthResponse {
  status: string;
  providers: Array<{ id: string; name: string }>;
  apiKeyConfigured: boolean;
  allowedRoots: string[];
}

const API_BASE = '/api';

export const api = {
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch('/health');
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    const data = await res.json();
    return data.projects;
  },

  async createProject(name: string, context?: string, defaultVocalsEnabled?: boolean): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, context, defaultVocalsEnabled }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    const data = await res.json();
    return data.project;
  },

  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (!res.ok) throw new Error('Failed to fetch project');
    const data = await res.json();
    return data.project;
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update project');
    const data = await res.json();
    return data.project;
  },

  async getProjectTracks(id: string): Promise<AudioTrack[]> {
    const res = await fetch(`${API_BASE}/projects/${id}/tracks`);
    if (!res.ok) throw new Error('Failed to fetch tracks');
    const data = await res.json();
    return data.tracks;
  },

  async getProjectHistory(id: string): Promise<GenerationHistory[]> {
    const res = await fetch(`${API_BASE}/projects/${id}/history`);
    if (!res.ok) throw new Error('Failed to fetch history');
    const data = await res.json();
    return data.history;
  },

  async getProviders(): Promise<Provider[]> {
    const res = await fetch(`${API_BASE}/providers`);
    if (!res.ok) throw new Error('Failed to fetch providers');
    const data = await res.json();
    return data.providers;
  },

  async generate(params: {
    projectId: string;
    providerId: string;
    prompt: string;
    vocalsEnabled?: boolean;
    duration?: number;
    referenceTrackPath?: string;
    outputFolder?: string;
    outputName?: string;
  }): Promise<{
    success: boolean;
    generationId: string;
    outputPath: string;
    lyrics?: string;
    referenceDescription?: string;
  }> {
    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Generation failed');
    }
    return res.json();
  },
};
