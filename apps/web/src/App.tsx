import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Project, type AudioTrack, type Provider } from './api';
import { ProjectList } from './components/ProjectList';
import { GenerationPanel } from './components/GenerationPanel';
import { TrackList } from './components/TrackList';
import { LanguageSwitcher } from './components/LanguageSwitcher';

export function App() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
  const [referenceTrack, setReferenceTrack] = useState<AudioTrack | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(true);

  useEffect(() => {
    loadProjects();
    loadProviders();
    checkHealth();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadTracks(selectedProject.id);
    } else {
      setTracks([]);
      setSelectedTrack(null);
    }
  }, [selectedProject]);

  async function checkHealth() {
    try {
      const health = await api.getHealth();
      setApiKeyConfigured(health.apiKeyConfigured);
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  async function loadProjects() {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }

  async function loadProviders() {
    try {
      const data = await api.getProviders();
      setProviders(data);
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  }

  async function loadTracks(projectId: string) {
    try {
      const data = await api.getProjectTracks(projectId);
      setTracks(data);
    } catch (error) {
      console.error('Failed to load tracks:', error);
    }
  }

  async function handleCreateProject(
    name: string,
    context?: string,
    defaultVocalsEnabled?: boolean
  ) {
    try {
      const project = await api.createProject(name, context, defaultVocalsEnabled);
      setProjects([...projects, project]);
      setSelectedProject(project);
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project');
    }
  }

  async function handleGenerate(params: {
    providerId: string;
    prompt: string;
    vocalsEnabled: boolean;
    duration?: number;
    referenceTrackPath?: string;
    outputFolder: string;
  }) {
    if (!selectedProject) return;

    await api.generate({
      projectId: selectedProject.id,
      ...params,
    });

    await loadTracks(selectedProject.id);
    setReferenceTrack(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          padding: '10px 20px',
          background: '#1e73be',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1 style={{ margin: 0 }}>{t('appName')}</h1>
        <LanguageSwitcher />
      </header>

      {!apiKeyConfigured && (
        <div
          style={{
            padding: '10px 20px',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            color: '#856404',
          }}
        >
          {t('apiKeyMissing')}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ProjectList
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={setSelectedProject}
          onCreateProject={handleCreateProject}
        />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {selectedProject ? (
            <>
              <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #ddd' }}>
                <TrackList
                  tracks={tracks}
                  selectedTrack={selectedTrack}
                  onSelectTrack={setSelectedTrack}
                  onSetReference={setReferenceTrack}
                />
              </div>
              <div style={{ width: '400px', overflowY: 'auto', borderLeft: '1px solid #ddd' }}>
                <GenerationPanel
                  project={selectedProject}
                  providers={providers}
                  referenceTrack={referenceTrack}
                  onGenerate={handleGenerate}
                  onClearReference={() => setReferenceTrack(null)}
                />
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
              }}
            >
              {t('selectProject')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
