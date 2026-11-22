const API_BASE = '/api';
export const api = {
    async getHealth() {
        const res = await fetch('/health');
        if (!res.ok)
            throw new Error('Health check failed');
        return res.json();
    },
    async getProjects() {
        const res = await fetch(`${API_BASE}/projects`);
        if (!res.ok)
            throw new Error('Failed to fetch projects');
        const data = await res.json();
        return data.projects;
    },
    async createProject(name, context, defaultVocalsEnabled) {
        const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, context, defaultVocalsEnabled }),
        });
        if (!res.ok)
            throw new Error('Failed to create project');
        const data = await res.json();
        return data.project;
    },
    async getProject(id) {
        const res = await fetch(`${API_BASE}/projects/${id}`);
        if (!res.ok)
            throw new Error('Failed to fetch project');
        const data = await res.json();
        return data.project;
    },
    async updateProject(id, updates) {
        const res = await fetch(`${API_BASE}/projects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!res.ok)
            throw new Error('Failed to update project');
        const data = await res.json();
        return data.project;
    },
    async getProjectTracks(id) {
        const res = await fetch(`${API_BASE}/projects/${id}/tracks`);
        if (!res.ok)
            throw new Error('Failed to fetch tracks');
        const data = await res.json();
        return data.tracks;
    },
    async getProjectHistory(id) {
        const res = await fetch(`${API_BASE}/projects/${id}/history`);
        if (!res.ok)
            throw new Error('Failed to fetch history');
        const data = await res.json();
        return data.history;
    },
    async getProviders() {
        const res = await fetch(`${API_BASE}/providers`);
        if (!res.ok)
            throw new Error('Failed to fetch providers');
        const data = await res.json();
        return data.providers;
    },
    async generate(params) {
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
