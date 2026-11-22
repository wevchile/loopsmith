import { useTranslation } from 'react-i18next';
import type { AudioTrack } from '../api';
import { AudioPlayer } from './AudioPlayer';

interface TrackListProps {
  tracks: AudioTrack[];
  selectedTrack: AudioTrack | null;
  onSelectTrack: (track: AudioTrack) => void;
  onSetReference: (track: AudioTrack) => void;
}

export function TrackList({
  tracks,
  selectedTrack,
  onSelectTrack,
  onSetReference,
}: TrackListProps) {
  const { t } = useTranslation();

  if (tracks.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
        <p style={{ color: '#666' }}>{t('noTracks')}</p>
      </div>
    );
  }

  const groupedTracks = tracks.reduce((acc, track) => {
    if (!acc[track.type]) {
      acc[track.type] = [];
    }
    acc[track.type].push(track);
    return acc;
  }, {} as Record<string, AudioTrack[]>);

  return (
    <div style={{ padding: '20px' }}>
      <h3>{t('tracks')}</h3>
      {Object.entries(groupedTracks).map(([type, typeTracks]) => (
        <div key={type} style={{ marginBottom: '20px' }}>
          <h4 style={{ marginBottom: '10px', color: '#666' }}>{type}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {typeTracks.map((track) => (
              <div
                key={track.id}
                style={{
                  padding: '10px',
                  background: selectedTrack?.id === track.id ? '#e3f2fd' : '#f9f9f9',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{track.name}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{track.folder}</div>
                  </div>
                  <button onClick={() => onSetReference(track)} style={{ fontSize: '12px' }}>
                    {t('useAsReference')}
                  </button>
                </div>
                {selectedTrack?.id === track.id && (
                  <AudioPlayer audioPath={`file://${track.path}`} />
                )}
                {selectedTrack?.id !== track.id && (
                  <button onClick={() => onSelectTrack(track)} style={{ width: '100%' }}>
                    {t('play')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
