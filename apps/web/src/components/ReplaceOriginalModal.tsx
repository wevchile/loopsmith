import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Replace, TriangleExclamationPoint, Undo2 } from 'lucide-react';
import { api, type AudioTrack, type ReplacePreview, type RevertPreview } from '../api';
import { Modal } from './Dialogs';

type Mode = { kind: 'replace'; track: AudioTrack } | { kind: 'revert'; original: AudioTrack };

interface Props {
  projectId: string;
  mode: Mode;
  tracks: AudioTrack[];
  onClose: () => void;
  /** Called after a successful replace or revert (reload tracks). */
  onDone: (message: string) => Promise<void> | void;
}

function PathRow({ label, name, path, tone }: { label: string; name: string; path: string; tone?: 'source' | 'target' | 'backup' }) {
  return (
    <div className={`path-row ${tone ?? ''}`}>
      <span className="path-label">{label}</span>
      <span className="path-name">{name}</span>
      <code className="path-full" title={path}>
        {path}
      </code>
    </div>
  );
}

/**
 * Warning and explicit confirmation for "Reemplazar original" (writes into the game repository) and
 * for reverting it. Shows exactly which files are renamed, written and converted.
 */
export function ReplaceOriginalModal({ projectId, mode, tracks, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [replacePreview, setReplacePreview] = useState<ReplacePreview | null>(null);
  const [revertPreview, setRevertPreview] = useState<RevertPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = mode.kind === 'replace'
      ? api.replacePreview(projectId, mode.track.generationId!).then((p) => !cancelled && setReplacePreview(p))
      : api.revertPreview(projectId, mode.original.id.replace(/^manifest:/, '')).then((p) => !cancelled && setRevertPreview(p));
    load.catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [projectId, mode]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode.kind === 'replace' && replacePreview) {
        await api.replaceOriginal(projectId, mode.track.generationId!, replacePreview.backup.name);
        await onDone(t('replaceDone', { target: replacePreview.target.name, backup: replacePreview.backup.name }));
      } else if (mode.kind === 'revert' && revertPreview) {
        await api.revertOriginal(projectId, revertPreview.entryId);
        await onDone(t('revertDone', { target: revertPreview.target.name }));
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isReplace = mode.kind === 'replace';
  const ready = isReplace ? Boolean(replacePreview) : Boolean(revertPreview);
  const aiName = (genId: string) => tracks.find((tr) => tr.generationId === genId)?.name ?? genId;

  return (
    <Modal title={isReplace ? t('replaceOriginalTitle') : t('revertTitle')} onClose={onClose} size="medium">
      <div className="replace-modal">
        <div className={`warning-box ${isReplace ? '' : 'calm'}`}>
          <TriangleExclamationPoint size={18} />
          <div>
            <strong>{isReplace ? t('replaceWarningTitle') : t('revertWarningTitle')}</strong>
            <p>{isReplace ? t('replaceWarningText') : t('revertWarningText')}</p>
          </div>
        </div>

        {!ready && !error && <p className="muted small">{t('loading')}</p>}

        {replacePreview && (
          <>
            <ol className="replace-steps">
              <li>
                <span className="step-title">{t('replaceStepBackup')}</span>
                <PathRow label={t('originalFile')} name={replacePreview.target.name} path={replacePreview.target.path} tone="target" />
                <ArrowDown size={14} className="step-arrow" />
                <PathRow label={t('backupFile')} name={replacePreview.backup.name} path={replacePreview.backup.path} tone="backup" />
              </li>
              <li>
                <span className="step-title">{t('replaceStepWrite')}</span>
                <PathRow label={t('aiFile')} name={replacePreview.source.name} path={replacePreview.source.path} tone="source" />
                <ArrowDown size={14} className="step-arrow" />
                <PathRow label={t('originalFile')} name={replacePreview.target.name} path={replacePreview.target.path} tone="target" />
              </li>
            </ol>
            <dl className="details-grid">
              <dt>{t('conversion')}</dt>
              <dd>
                {replacePreview.conversion
                  ? t('conversionDetail', {
                      from: replacePreview.conversion.from.toUpperCase(),
                      to: replacePreview.conversion.to.toUpperCase(),
                      rate: replacePreview.conversion.sampleRate ? `${replacePreview.conversion.sampleRate} Hz` : '?',
                      channels: replacePreview.conversion.channels ?? '?',
                    })
                  : t('noConversion', { format: replacePreview.target.format })}
              </dd>
              <dt>{t('manifest')}</dt>
              <dd>{t('replaceManifestNote')}</dd>
              <dt>{t('gameRepo')}</dt>
              <dd>
                <code>{replacePreview.gameRoot}</code>
              </dd>
              {replacePreview.activeReplacements > 0 && (
                <>
                  <dt>{t('previousReplacements')}</dt>
                  <dd>{t('previousReplacementsNote', { count: replacePreview.activeReplacements })}</dd>
                </>
              )}
            </dl>
          </>
        )}

        {revertPreview && (
          <>
            <ol className="replace-steps">
              <li>
                <span className="step-title">
                  {revertPreview.current.action === 'delete' ? t('revertStepDelete') : t('revertStepKeep', { name: revertPreview.current.keepRelativePath })}
                </span>
                <PathRow label={t('currentFile')} name={`${revertPreview.target.name} (${aiName(revertPreview.record.generationId)})`} path={revertPreview.target.path} tone="source" />
              </li>
              <li>
                <span className="step-title">{t('revertStepRestore')}</span>
                <PathRow label={t('backupFile')} name={revertPreview.backup.name} path={revertPreview.backup.path} tone="backup" />
                <ArrowDown size={14} className="step-arrow" />
                <PathRow label={t('originalFile')} name={revertPreview.target.name} path={revertPreview.target.path} tone="target" />
              </li>
            </ol>
            {!revertPreview.current.matchesReplacement && revertPreview.current.exists && <p className="muted small">{t('revertModifiedNote')}</p>}
          </>
        )}

        {error && <p className="error-text">{error}</p>}

        {isReplace && replacePreview && (
          <label className="switch confirm-check">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            {t('replaceConfirmCheck')}
          </label>
        )}

        <div className="actions">
          <button className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className={`btn ${isReplace ? 'warning' : 'primary'}`}
            disabled={!ready || busy || (isReplace && !understood)}
            onClick={() => void confirm()}
          >
            {isReplace ? <Replace size={14} /> : <Undo2 size={14} />} {isReplace ? t('replaceConfirm') : t('revertConfirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
