import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SOUND_TYPES, api, type AudioTrack, type SoundType } from '../api';
import { AudioPlayer } from './AudioPlayer';

interface Props {
  projectId: string;
  tracks: AudioTrack[];
  selectedFolder: string;
  selectedTrackId: string | null;
  onSelect: (track: AudioTrack) => void;
  onUseAsBase: (track: AudioTrack) => void;
}

export function TrackList({ projectId, tracks, selectedFolder, selectedTrackId, onSelect, onUseAsBase }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<SoundType | 'ALL'>('ALL');

  const visible = useMemo(
    () =>
      tracks.filter((track) => {
        if (filter !== 'ALL' && track.type !== filter) return false;
        if (selectedFolder && track.source === 'local') {
          return track.folder === selectedFolder || track.folder.startsWith(`${selectedFolder}/`);
        }
        return true;
      }),
    [tracks, filter, selectedFolder]
  );

  const grouped = SOUND_TYPES.map((type) => ({ type, items: visible.filter((tr) => tr.type === type) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <section className="panel tracks">
      <div className="panel-header">
        <h3>{t('tracks')}</h3>
        <div className="chips">
          {(['ALL', ...SOUND_TYPES] as const).map((type) => (
            <button key={type} className={`chip ${filter === type ? 'active' : ''}`} onClick={() => setFilter(type)}>
              {type === 'ALL' ? t('filterAll') : type}
            </button>
          ))}
        </div>
      </div>
      {grouped.length === 0 && <p className="muted">{t('noTracks')}</p>}
      {grouped.map((group) => (
        <div key={group.type} className="track-group">
          <h4>
            {group.type} <span className="muted">({group.items.length})</span>
          </h4>
          {group.items.map((track) => {
            const selected = track.id === selectedTrackId;
            return (
              <div key={track.id} className={`track ${selected ? 'selected' : ''}`}>
                <div className="track-row" onClick={() => onSelect(track)}>
                  <div>
                    <div className="track-name">{track.name}</div>
                    <div className="muted small">
                      {track.folder || '/'} · {track.source === 'manifest' ? t('sourceManifest') : t('sourceLocal')}
                      {track.isGenerated && ` · ${t('generated')}`}
                      {track.exists === false && <span className="error-text"> · {t('missingFile')}</span>}
                    </div>
                  </div>
                  <button
                    className="secondary small"
                    disabled={track.exists === false}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUseAsBase(track);
                    }}
                  >
                    {t('useAsBase')}
                  </button>
                </div>
                {selected && track.exists !== false && <AudioPlayer url={api.audioUrl(projectId, track.id)} />}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
