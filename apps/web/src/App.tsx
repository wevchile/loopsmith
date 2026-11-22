import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioWaveform, PanelRightClose, PanelRightOpen, Settings, X } from 'lucide-react';
import { api, type AudioTrack, type FolderNode, type GenerationHistory, type Health, type Project } from './api';
import { useLibraryActions } from './actions';
import { DialogProvider } from './components/Dialogs';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { Library } from './components/Library';
import { Inspector, type InspectorTab } from './components/Inspector';
import { TrackDetails } from './components/TrackDetails';
import { GenerationPanel, type GenerateInput } from './components/GenerationPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsModal, type SettingsTab } from './components/SettingsModal';
import { LanguageSwitcher } from './components/LanguageSwitcher';

const INSPECTOR_KEY = 'loopsmith.inspectorOpen';
const PROJECT_KEY = 'loopsmith.projectId';

function flattenFolders(node: FolderNode | null): string[] {
  if (!node) return [];
  const out: string[] = [];
  const walk = (n: FolderNode) => {
    out.push(n.path);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

export function App() {
  return (
    <DialogProvider>
      <Workspace />
    </DialogProvider>
  );
}

function Workspace() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<Health | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(PROJECT_KEY));
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [history, setHistory] = useState<GenerationHistory[]>([]);
  const [tree, setTree] = useState<FolderNode | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [autoPlayId, setAutoPlayId] = useState<string | null>(null);
  const [useReference, setUseReference] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('generate');
  const [inspectorOpen, setInspectorOpen] = useState(() => localStorage.getItem(INSPECTOR_KEY) !== 'false');

  const project = projects.find((p) => p.id === selectedId) ?? null;
  const selectedTrack = tracks.find((tr) => tr.id === selectedTrackId) ?? null;
  const folders = useMemo(() => flattenFolders(tree), [tree]);
  const originals = useMemo(() => tracks.filter((tr) => tr.source === 'manifest'), [tracks]);

  useEffect(() => {
    localStorage.setItem(INSPECTOR_KEY, String(inspectorOpen));
  }, [inspectorOpen]);

  useEffect(() => {
    if (selectedId) localStorage.setItem(PROJECT_KEY, selectedId);
    else localStorage.removeItem(PROJECT_KEY);
  }, [selectedId]);

  const loadProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setHealth(await api.health());
        const list = await loadProjects();
        setSelectedId((id) => (id && list.some((p) => p.id === id) ? id : (list[0]?.id ?? null)));
        setServerDown(false);
      } catch {
        setServerDown(true);
      }
    })();
  }, [loadProjects]);

  const loadProjectData = useCallback(async (id: string) => {
    try {
      const [tr, hi, fo] = await Promise.all([api.tracks(id), api.history(id), api.folders(id)]);
      setTracks(tr);
      setHistory(hi);
      setTree(fo);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setTracks([]);
    setHistory([]);
    setTree(null);
    setSelectedFolder('');
    setSelectedTrackId(null);
    setUseReference(false);
    if (selectedId) void loadProjectData(selectedId);
  }, [selectedId, loadProjectData]);

  // Keep the selection when a track is renamed or moved (its id changes but the generation id does not).
  const reload = useCallback(async () => {
    if (!project) return;
    const previous = tracks.find((tr) => tr.id === selectedTrackId);
    await loadProjectData(project.id);
    if (previous?.generationId) {
      const fresh = await api.tracks(project.id);
      const same = fresh.find((tr) => tr.generationId === previous.generationId);
      setSelectedTrackId(same ? same.id : null);
    }
  }, [project, tracks, selectedTrackId, loadProjectData]);

  const actions = useLibraryActions({
    projectId: project?.id ?? '',
    folders,
    originals,
    onChanged: reload,
    onError: setError,
  });

  const replaceProject = async (updated: Project) => {
    setProjects((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    await loadProjectData(updated.id);
  };

  const handleCreate = async (input: { name: string; context?: string; defaultVocalsEnabled: boolean; rootIndex: number }) => {
    try {
      const created = await api.createProject(input);
      await loadProjects();
      setSelectedId(created.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleGenerate = async (input: GenerateInput) => {
    if (!project) throw new Error('No project');
    const entry = await api.generate({ projectId: project.id, ...input });
    await loadProjectData(project.id);
    if (entry.outputTrackId) setSelectedTrackId(entry.outputTrackId);
    return entry.outputTrackId?.replace(/^local:/, '') ?? entry.outputPath;
  };

  const selectTrack = useCallback((track: AudioTrack | null, play?: boolean) => {
    setSelectedTrackId(track?.id ?? null);
    setAutoPlayId(play && track ? track.id : null);
  }, []);

  const useAsBase = (track: AudioTrack) => {
    setSelectedTrackId(track.id);
    setUseReference(true);
    setInspectorTab('generate');
    setInspectorOpen(true);
  };

  const openDetails = (track: AudioTrack) => {
    setSelectedTrackId(track.id);
    setInspectorTab('track');
    setInspectorOpen(true);
  };

  // "i" toggles the inspector, "," opens settings (outside text fields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey || settingsTab) return;
      if (e.key === 'i') setInspectorOpen((o) => !o);
      if (e.key === ',' && project) setSettingsTab('project');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project, settingsTab]);

  return (
    <div className={`app ${inspectorOpen ? 'inspector-open' : 'inspector-closed'}`}>
      <header className="topbar">
        <div className="brand">
          <AudioWaveform size={20} className="brand-icon" />
          <span className="brand-name">loopsmith</span>
        </div>
        <ProjectSwitcher projects={projects} roots={health?.allowedRoots ?? []} selectedId={selectedId} onSelect={setSelectedId} onCreate={handleCreate} />
        <div className="topbar-spacer" />
        {health?.generation.model && (
          <span className={`pill ${health.generation.available ? 'ok' : 'warn'}`} title={t('model')}>
            <span className="dot" /> {health.generation.model}
          </span>
        )}
        <LanguageSwitcher />
        <button className="icon-btn" title={`${t('settings')} (,)`} aria-label={t('settings')} disabled={!project} onClick={() => setSettingsTab('project')}>
          <Settings size={17} />
        </button>
        <button
          className="icon-btn"
          title={`${inspectorOpen ? t('hidePanel') : t('showPanel')} (i)`}
          aria-label={inspectorOpen ? t('hidePanel') : t('showPanel')}
          aria-pressed={inspectorOpen}
          onClick={() => setInspectorOpen((o) => !o)}
        >
          {inspectorOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
        </button>
      </header>

      {serverDown && <div className="banner error">{t('serverDown')}</div>}
      {health && !health.generation.available && <div className="banner warning">{health.generation.message ?? t('generationUnavailable')}</div>}
      {error && (
        <div className="banner error" role="alert">
          <span>
            {t('errorPrefix')}: {error}
          </span>
          <button className="icon-btn" onClick={() => setError(null)} aria-label={t('close')}>
            <X size={14} />
          </button>
        </div>
      )}

      {project ? (
        <main className="workspace">
          <Library
            projectId={project.id}
            tracks={tracks}
            folders={folders}
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
            selectedTrackId={selectedTrackId}
            autoPlayId={autoPlayId}
            actions={actions}
            onSelect={selectTrack}
            onUseAsBase={useAsBase}
            onOpenDetails={openDetails}
          />
          {inspectorOpen && (
            <Inspector
              tab={inspectorTab}
              onTabChange={setInspectorTab}
              historyCount={history.length}
              generate={
                <GenerationPanel
                  project={project}
                  health={health}
                  folders={folders}
                  defaultFolder={selectedFolder || 'SOUNDTRACK'}
                  selectedTrack={selectedTrack}
                  useReference={useReference}
                  onUseReferenceChange={setUseReference}
                  onGenerate={handleGenerate}
                />
              }
              track={
                <TrackDetails
                  projectId={project.id}
                  track={selectedTrack}
                  tracks={tracks}
                  actions={actions}
                  onUseAsBase={useAsBase}
                  onSelectTrack={(id) => setSelectedTrackId(id)}
                />
              }
              history={<HistoryPanel history={history} onSelectTrack={(id) => setSelectedTrackId(id)} />}
            />
          )}
        </main>
      ) : (
        <main className="empty-state big">{t('selectProject')}</main>
      )}

      {project && settingsTab && (
        <SettingsModal
          project={project}
          initialTab={settingsTab}
          tree={tree}
          selectedFolder={selectedFolder}
          onSelectFolder={setSelectedFolder}
          actions={actions}
          onClose={() => setSettingsTab(null)}
          onSave={async (changes) => {
            try {
              await replaceProject(await api.updateProject(project.id, changes));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
          onRemove={async () => {
            try {
              await api.unlinkProject(project.id);
              setSettingsTab(null);
              setSelectedId(null);
              await loadProjects();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
          onProjectChange={replaceProject}
        />
      )}
    </div>
  );
}
