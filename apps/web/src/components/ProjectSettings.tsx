import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '../api';

interface Props {
  project: Project;
  onSave: (changes: { name: string; context: string; defaultVocalsEnabled: boolean }) => Promise<void>;
  onRemove: () => Promise<void>;
}

export function ProjectSettings({ project, onSave, onRemove }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(project.name);
  const [context, setContext] = useState(project.context ?? '');
  const [vocals, setVocals] = useState(project.defaultVocalsEnabled);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setName(project.name);
    setContext(project.context ?? '');
    setVocals(project.defaultVocalsEnabled);
    setStatus(null);
  }, [project]);

  const dirty = name !== project.name || context !== (project.context ?? '') || vocals !== project.defaultVocalsEnabled;

  return (
    <section className="panel">
      <h3>{t('settings')}</h3>
      <p className="muted path">{project.path}</p>
      <label>
        {t('projectName')}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        {t('projectContext')}
        <textarea value={context} placeholder={t('projectContextPlaceholder')} onChange={(e) => setContext(e.target.value)} />
        <small className="muted">{t('projectContextHelp')}</small>
      </label>
      <label className="inline">
        <input type="checkbox" checked={vocals} onChange={(e) => setVocals(e.target.checked)} />
        {t('defaultVocals')}
      </label>
      <div className="actions">
        <button
          className="danger secondary"
          onClick={() => {
            if (window.confirm(t('removeProjectConfirm'))) void onRemove();
          }}
        >
          {t('removeProject')}
        </button>
        <button
          disabled={!dirty || !name.trim()}
          onClick={async () => {
            await onSave({ name, context, defaultVocalsEnabled: vocals });
            setStatus(t('saved'));
          }}
        >
          {t('save')}
        </button>
      </div>
      {status && <small className="ok-text">{status}</small>}
    </section>
  );
}
