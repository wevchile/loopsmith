import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AudioTrack, type FolderNode, type GenerationHistory, type Health, type Project } from './api';
import { ProjectList } from './components/ProjectList';
import { ProjectSettings } from './components/ProjectSettings';
import { FolderTree } from './components/FolderTree';
import { TrackList } from './components/TrackList';
import { GenerationPanel, type GenerateInput } from './components/GenerationPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { ManifestPanel } from './components/ManifestPanel';
import { LanguageSwitcher } from './components/LanguageSwitcher';

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
  const { t } = useTranslation();
  const [health, setHealth] = useState<Health | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [history, setHistory] = useState<GenerationHistory[]>([]);
  const [tree, setTree] = useState<FolderNode | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [useReference, setUseReference] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const project = projects.find((p) => p.id === selectedId) ?? null;
  const selectedTrack = tracks.find((tr) => tr.id === selectedTrackId) ?? null;
  const folders = useMemo(() => flattenFolders(tree), [tree]);

  const loadProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setHealth(await api.health());
        await loadProjects();
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

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>loopsmith</h1>
          <span className="tagline">{t('appTagline')}</span>
        </div>
        <LanguageSwitcher />
      </header>

      {serverDown && <div className="banner error">{t('serverDown')}</div>}
      {health && !health.generation.available && <div className="banner warning">{t('generationUnavailable')}</div>}
      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {t('errorPrefix')}: {error} (x)
        </div>
      )}

      <div className="layout">
        <ProjectList
          projects={projects}
          roots={health?.allowedRoots ?? []}
          selectedId={selectedId}
          onSelect={(p) => setSelectedId(p.id)}
          onCreate={handleCreate}
        />

        {project ? (
          <main className="workspace">
            <div className="column left">
              <ProjectSettings
                project={project}
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
                    setSelectedId(null);
                    await loadProjects();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
              <FolderTree
                projectId={project.id}
                tree={tree}
                selectedFolder={selectedFolder}
                onSelect={setSelectedFolder}
                onChanged={() => loadProjectData(project.id)}
                onError={setError}
              />
              <ManifestPanel project={project} onProjectChange={replaceProject} />
            </div>
            <div className="column center">
              <TrackList
                projectId={project.id}
                tracks={tracks}
                selectedFolder={selectedFolder}
                selectedTrackId={selectedTrackId}
                onSelect={(tr) => setSelectedTrackId(tr.id === selectedTrackId ? null : tr.id)}
                onUseAsBase={(tr) => {
                  setSelectedTrackId(tr.id);
                  setUseReference(true);
                }}
              />
            </div>
            <div className="column right">
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
              <HistoryPanel history={history} onSelectTrack={setSelectedTrackId} />
            </div>
          </main>
        ) : (
          <main className="empty">{t('selectProject')}</main>
        )}
      </div>
    </div>
  );
}
