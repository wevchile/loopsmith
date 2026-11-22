import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, FolderInput, Link2, Lock, Pencil, Save, Trash2, Wand2 } from 'lucide-react';
import { TRACK_STATUSES, api, type AudioTrack } from '../api';
import type { LibraryActions } from '../actions';
import { SourceBadge, StatusBadge, STATUS_ICON } from './StatusBadge';

interface Props {
  projectId: string;
  track: AudioTrack | null;
  tracks: AudioTrack[];
  actions: LibraryActions;
  onUseAsBase: (track: AudioTrack) => void;
  onSelectTrack: (id: string) => void;
}

/** Inspector tab with everything about the selected track: status, link, notes, tags and file actions. */
export function TrackDetails({ projectId, track, tracks, actions, onUseAsBase, onSelectTrack }: Props) {
  const { t, i18n } = useTranslation();
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    setNotes(track?.generation?.notes ?? '');
    setTags((track?.generation?.tags ?? []).join(', '));
  }, [track?.id, track?.generation?.notes, track?.generation?.tags]);

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
          <p className="readonly-note">
            <Lock size={13} /> {t('originalReadOnly')}
          </p>
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
    </div>
  );
}
