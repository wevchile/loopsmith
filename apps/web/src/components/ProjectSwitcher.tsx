import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderKanban, Plus } from 'lucide-react';
import type { Project } from '../api';
import { Modal } from './Dialogs';

interface Props {
  projects: Project[];
  roots: string[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (input: { name: string; context?: string; defaultVocalsEnabled: boolean; rootIndex: number }) => Promise<void>;
}

/** Project selector and "new project" button in the header (replaces the old left column). */
export function ProjectSwitcher({ projects, roots, selectedId, onSelect, onCreate }: Props) {
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
    <div className="project-switcher">
      <FolderKanban size={15} className="muted-icon" />
      <select value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value || null)} aria-label={t('projects')}>
        <option value="">{projects.length === 0 ? t('noProjects') : t('selectProjectShort')}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="icon-btn" title={t('newProject')} aria-label={t('newProject')} onClick={() => setOpen(true)}>
        <Plus size={16} />
      </button>

      {open && (
        <Modal title={t('newProject')} onClose={() => !busy && setOpen(false)}>
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
          <label className="switch">
            <input type="checkbox" checked={vocals} onChange={(e) => setVocals(e.target.checked)} />
            <span>{t('defaultVocals')}</span>
          </label>
          <div className="actions">
            <button className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
              {t('cancel')}
            </button>
            <button className="btn primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
              {t('create')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
