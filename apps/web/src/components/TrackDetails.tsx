import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, FolderInput, Link2, Lock, Pencil, Replace, Save, Trash2, Undo2, Wand2 } from 'lucide-react';
import { TRACK_STATUSES, api, type AudioTrack } from '../api';
import type { LibraryActions } from '../actions';
import { InGameBadge, ReplacedBadge, SourceBadge, StatusBadge, STATUS_ICON } from './StatusBadge';
import { ReplaceOriginalModal } from './ReplaceOriginalModal';

interface Props {
  projectId: string;
  track: AudioTrack | null;
  tracks: AudioTrack[];
  actions: LibraryActions;
  onUseAsBase: (track: AudioTrack) => void;
  onSelectTrack: (id: string) => void;
  /** Reloads tracks after a replace or revert and shows a message. */
  onReplaced: (message: string) => Promise<void> | void;
}

/** Inspector tab with everything about the selected track: status, link, notes, tags and file actions. */
export function TrackDetails({ projectId, track, tracks, actions, onUseAsBase, onSelectTrack, onReplaced }: Props) {
  const { t, i18n } = useTranslation();
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [replaceMode, setReplaceMode] = useState<'replace' | 'revert' | null>(null);

  useEffect(() => {
    setNotes(track?.generation?.notes ?? '');
    setTags((track?.generation?.tags ?? []).join(', '));
  }, [track?.id, track?.generation?.notes, track?.generation?.tags]);

  useEffect(() => setReplaceMode(null), [track?.id]);
  const modalMode = useMemo(
    () => (track && replaceMode ? (replaceMode === 'replace' ? { kind: 'replace' as const, track } : { kind: 'revert' as const, original: track }) : null),
    // Only rebuilt when the modal opens or the track changes, so the preview is fetched once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replaceMode, track?.id]
  );

  if (!track) return <p className="empty-state">{t('selectTrackHint')}</p>;

  const original = track.generation?.originalTrackId ? tracks.find((tr) => tr.id === track.generation!.originalTrackId) : undefined;
  const candidates = track.source === 'manifest' ? tracks.filter((tr) => tr.generation?.originalTrackId === track.id) : [];
  const parsedTags = tags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const dirty = notes !== (track.generation?.notes ?? '') || parsedTags.join(',') !== (track.generation?.tags ?? []).join(',');

  return (
    <div className="track-details">
      <div className="details-title">
        <h3 title={track.path}>{track.name}</h3>
        <div className="badges">
          <SourceBadge track={track} />
          {track.generation && <StatusBadge status={track.generation.status} />}
          {track.replacement && <ReplacedBadge track={track} />}
          {track.generation?.inGame && <InGameBadge />}
        </div>
      </div>

      <dl className="details-grid">
        <dt>{t('type')}</dt>
        <dd>{track.type}</dd>
        <dt>{t('folder')}</dt>
        <dd>{track.folder || '/'}</dd>
        {track.generation && (
          <>
            <dt>{t('model')}</dt>
            <dd>{track.generation.model}</dd>
            <dt>{t('created')}</dt>
            <dd>{new Date(track.generation.timestamp).toLocaleString(i18n.resolvedLanguage)}</dd>
            <dt>{t('prompt')}</dt>
            <dd className="prompt-text">{track.generation.prompt}</dd>
          </>
        )}
      </dl>

      <div className="details-actions">
        <button className="btn" onClick={() => onUseAsBase(track)} disabled={track.exists === false}>
          <Wand2 size={14} /> {t('useAsBase')}
        </button>
        <a className="btn" href={api.downloadUrl(projectId, track.id)} download>
          <Download size={14} /> {t('download')}
        </a>
      </div>

      {track.source === 'manifest' && (
        <>
          {track.replacement ? (
            <div className="replaced-box">
              <p>
                <Replace size={13} /> {t('replacedBy', { name: tracks.find((tr) => tr.generationId === track.replacement!.latest.generationId)?.name ?? track.replacement.latest.sourceTrackId })}
              </p>
              <dl className="details-grid">
                <dt>{t('backupFile')}</dt>
                <dd>
                  <code>{track.replacement.latest.backupRelativePath}</code>
                </dd>
                <dt>{t('replacedAt')}</dt>
                <dd>{new Date(track.replacement.latest.replacedAt).toLocaleString(i18n.resolvedLanguage)}</dd>
                {track.replacement.latest.conversion && (
                  <>
                    <dt>{t('conversion')}</dt>
                    <dd>
                      {track.replacement.latest.conversion.from.toUpperCase()} {'->'} {track.replacement.latest.conversion.to.toUpperCase()}
                    </dd>
                  </>
                )}
                {track.replacement.active > 1 && (
                  <>
                    <dt>{t('previousReplacements')}</dt>
                    <dd>{t('previousReplacementsNote', { count: track.replacement.active - 1 })}</dd>
                  </>
                )}
              </dl>
              <button className="btn" onClick={() => setReplaceMode('revert')}>
                <Undo2 size={14} /> {t('revertReplacement')}
              </button>
            </div>
          ) : (
            <p className="readonly-note">
              <Lock size={13} /> {t('originalReadOnly')}
            </p>
          )}
          <h4 className="section-title">{t('candidatesFor')}</h4>
          {candidates.length === 0 ? (
            <p className="muted small">{t('noCandidates')}</p>
          ) : (
            <ul className="candidate-list">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button className="link" onClick={() => onSelectTrack(c.id)}>
                    {c.name}
                  </button>
                  <StatusBadge status={c.generation!.status} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {track.generation && (
        <>
          <h4 className="section-title">{t('status')}</h4>
          <div className="segmented status-segmented">
            {TRACK_STATUSES.map((s) => {
              const Icon = STATUS_ICON[s];
              return (
                <button key={s} className={`${track.generation!.status === s ? 'active' : ''} f-${s}`} aria-pressed={track.generation!.status === s} onClick={() => void actions.setStatus(track, s)}>
                  <Icon size={13} /> {t(`status_${s}`)}
                </button>
              );
            })}
          </div>
          <p className="muted small">{t('chosenRule')}</p>

          <h4 className="section-title">{t('linkedOriginal')}</h4>
          <div className="linked-original">
            {original ? (
              <button className="link" onClick={() => onSelectTrack(original.id)}>
                {original.name}
              </button>
            ) : (
              <span className="muted small">{t('noOriginal')}</span>
            )}
            <button className="btn small" onClick={() => void actions.linkOriginal(track)}>
              <Link2 size={13} /> {original ? t('change') : t('linkOriginal')}
            </button>
          </div>
          {original && (
            <div className={`replace-cta ${track.generation.status === 'chosen' ? 'emphasis' : ''}`}>
              <p className="muted small">{track.generation.inGame ? t('inGameNote') : t('replaceOriginalHelp')}</p>
              <button className="btn warning" onClick={() => setReplaceMode('replace')} disabled={original.exists === false || track.generation.inGame}>
                <Replace size={14} /> {t('replaceOriginal')}
              </button>
            </div>
          )}

          <h4 className="section-title">{t('notes')}</h4>
          <textarea value={notes} rows={3} placeholder={t('notesPlaceholder')} onChange={(e) => setNotes(e.target.value)} />
          <label>
            {t('tags')}
            <input value={tags} placeholder={t('tagsPlaceholder')} onChange={(e) => setTags(e.target.value)} />
          </label>
          <button
            className="btn primary"
            disabled={!dirty}
            onClick={() => void actions.saveMeta(track, { notes, tags: parsedTags })}
          >
            <Save size={14} /> {t('save')}
          </button>

          <h4 className="section-title">{t('file')}</h4>
          <div className="details-actions">
            <button className="btn" onClick={() => void actions.rename(track)}>
              <Pencil size={14} /> {t('rename')}
            </button>
            <button className="btn" onClick={() => void actions.move(track)}>
              <FolderInput size={14} /> {t('moveTo')}
            </button>
            <button className="btn" onClick={() => void actions.duplicate(track)}>
              <Copy size={14} /> {t('duplicate')}
            </button>
            <button className="btn danger" onClick={() => void actions.remove(track)}>
              <Trash2 size={14} /> {t('delete')}
            </button>
          </div>
        </>
      )}

      {modalMode && (
        <ReplaceOriginalModal projectId={projectId} mode={modalMode} tracks={tracks} onClose={() => setReplaceMode(null)} onDone={onReplaced} />
      )}
    </div>
  );
}
