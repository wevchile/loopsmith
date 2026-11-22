import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '../api';

interface ProjectListProps {
  projects: Project[];
  roots: string[];
  selectedId: string | null;
  onSelect: (project: Project) => void;
  onCreate: (input: { name: string; context?: string; defaultVocalsEnabled: boolean; rootIndex: number }) => Promise<void>;
}

export function ProjectList({ projects, roots, selectedId, onSelect, onCreate }: ProjectListProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [vocals, setVocals] = useState(false);
  const [rootIndex, setRootIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), context: context.trim() || undefined, defaultVocalsEnabled: vocals, rootIndex });
      setName('');
      setContext('');
      setVocals(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="sidebar">
      <h2>{t('projects')}</h2>
      <button className="full" onClick={() => setOpen(true)}>
        + {t('newProject')}
      </button>
      {projects.length === 0 ? (
        <p className="muted">{t('noProjects')}</p>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id} className={p.id === selectedId ? 'selected' : ''} onClick={() => onSelect(p)}>
              <strong>{p.name}</strong>
              {p.context && <small>{p.context}</small>}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('newProject')}</h3>
            <label>
              {t('projectName')}
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
            </label>
            <label>
              {t('projectContext')}
              <textarea value={context} placeholder={t('projectContextPlaceholder')} onChange={(e) => setContext(e.target.value)} />
              <small className="muted">{t('projectContextHelp')}</small>
            </label>
            {roots.length > 1 && (
              <label>
                {t('storageRoot')}
                <select value={rootIndex} onChange={(e) => setRootIndex(Number(e.target.value))}>
                  {roots.map((r, i) => (
                    <option key={r} value={i}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="inline">
              <input type="checkbox" checked={vocals} onChange={(e) => setVocals(e.target.checked)} />
              {t('defaultVocals')}
            </label>
            <div className="actions">
              <button className="secondary" onClick={() => setOpen(false)} disabled={busy}>
                {t('cancel')}
              </button>
              <button onClick={() => void submit()} disabled={busy || !name.trim()}>
                {t('create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
