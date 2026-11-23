import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ManifestPreview, type Project } from '../api';

interface Props {
  project: Project;
  onProjectChange: (project: Project) => Promise<void>;
}

const KEYS = ['added', 'removed', 'renamed', 'moved', 'updated'] as const;

export function ManifestPanel({ project, onProjectChange }: Props) {
  const { t, i18n } = useTranslation();
  const [manifestPath, setManifestPath] = useState(project.manifestPath ?? '');
  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setManifestPath(project.manifestPath ?? '');
    setPreview(null);
    setError(null);
  }, [project.id, project.manifestPath]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doPreview = () => run(async () => setPreview(await api.previewManifest(project.id, manifestPath.trim() || undefined)));
  const doApply = () =>
    run(async () => {
      const result = await api.applyManifest(project.id, manifestPath.trim() || undefined);
      setPreview(null);
      await onProjectChange(result.project);
    });
  const doUnlink = () =>
    run(async () => {
      await onProjectChange(await api.unlinkManifest(project.id));
    });

  return (
    <div className="settings-section">
      {project.manifestPath ? (
        <p className="small">
          {t('linkedTo')}: <span className="path">{project.manifestPath}</span>
          {project.manifestSyncedAt && (
            <>
              <br />
              <span className="muted">
                {t('lastSync')}: {new Date(project.manifestSyncedAt).toLocaleString(i18n.resolvedLanguage)}
              </span>
            </>
          )}
        </p>
      ) : (
        <p className="muted small">{t('manifestHelp')}</p>
      )}
      <input value={manifestPath} placeholder={t('manifestPathPlaceholder')} onChange={(e) => setManifestPath(e.target.value)} disabled={busy} />
      <div className="actions">
        {project.manifestPath && (
          <button className="secondary" onClick={() => void doUnlink()} disabled={busy}>
            {t('unlink')}
          </button>
        )}
        <button onClick={() => void doPreview()} disabled={busy || !manifestPath.trim()}>
          {project.manifestPath ? t('checkUpdates') : t('preview')}
        </button>
      </div>
      {error && <p className="error-text small">{error}</p>}
      {preview && (
        <div className="manifest-preview">
          <p className="small">
            {preview.gameRepo} · {preview.entryCount} {t('entries')}
          </p>
          {!preview.summary.hasChanges && !preview.isFirstLink ? (
            <p className="muted small">{t('noChanges')}</p>
          ) : (
            <ul className="small">
              {KEYS.map((k) =>
                preview.summary[k] > 0 ? (
                  <li key={k}>
                    <strong>
                      {t(k)}: {preview.summary[k]}
                    </strong>
                    <ul>
                      {(preview.diff[k] as Array<{ name?: string; old?: { name: string }; new?: { name: string } }>).slice(0, 8).map((item, i) => (
                        <li key={i}>{item.name ?? (item.old && item.new ? `${item.old.name} -> ${item.new.name}` : '')}</li>
                      ))}
                    </ul>
                  </li>
                ) : null
              )}
              <li className="muted">
                {t('unchanged')}: {preview.summary.unchanged}
              </li>
            </ul>
          )}
          {preview.missingFiles.length > 0 && (
            <p className="error-text small">
              {t('missingFiles')}: {preview.missingFiles.slice(0, 10).join(', ')}
              {preview.missingFiles.length > 10 ? '...' : ''}
            </p>
          )}
          {(preview.summary.hasChanges || preview.isFirstLink || !project.manifestPath) && (
            <button className="full" onClick={() => void doApply()} disabled={busy}>
              {project.manifestPath ? t('apply') : t('link')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
