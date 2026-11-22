import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CircleDashed,
  Copy,
  Download,
  FolderInput,
  Link2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Star,
  Trash2,
  Wand2,
  XCircle,
} from 'lucide-react';
import { api, type AudioTrack, type TrackStatus } from '../api';
import type { LibraryActions } from '../actions';
import { AudioPlayer, PLAY_STATE_EVENT, TOGGLE_PLAY_EVENT } from './AudioPlayer';
import { Menu } from './Menu';
import { SourceBadge, StatusBadge } from './StatusBadge';

interface Props {
  projectId: string;
  track: AudioTrack;
  selected: boolean;
  nested?: boolean;
  /** Linked candidates (for originals). */
  candidateCount?: number;
  chosenName?: string;
  actions: LibraryActions;
  autoPlay?: boolean;
  onSelect: (track: AudioTrack, play?: boolean) => void;
  onUseAsBase: (track: AudioTrack) => void;
  onOpenDetails: (track: AudioTrack) => void;
}

/** Deterministic pseudo waveform so rows read like an audio editor before the real one loads. */
function bars(seed: string, count = 48): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const noise = ((h >>> 0) % 1000) / 1000;
    const envelope = 0.45 + 0.55 * Math.sin((i / count) * Math.PI);
    out.push(Math.max(0.12, Math.min(1, envelope * (0.35 + noise * 0.75))));
  }
  return out;
}

const STATUS_ACTIONS: Array<{ status: TrackStatus; icon: typeof Star }> = [
  { status: 'candidate', icon: CircleDashed },
  { status: 'chosen', icon: Star },
  { status: 'discarded', icon: XCircle },
];

export function TrackRow({
  projectId,
  track,
  selected,
  nested,
  candidateCount,
  chosenName,
  actions,
  autoPlay,
  onSelect,
  onUseAsBase,
  onOpenDetails,
}: Props) {
  const { t } = useTranslation();
  const wave = useMemo(() => bars(track.id), [track.id]);
  const missing = track.exists === false;
  const ai = track.isGenerated && track.generation;
  const status = track.generation?.status;
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!selected) {
      setPlaying(false);
      return;
    }
    const onState = (e: Event) => setPlaying((e as CustomEvent<boolean>).detail);
    window.addEventListener(PLAY_STATE_EVENT, onState);
    return () => window.removeEventListener(PLAY_STATE_EVENT, onState);
  }, [selected]);

  return (
    <div className={`track-row-wrap ${selected ? 'selected' : ''} ${nested ? 'nested' : ''} ${status ? `is-${status}` : ''}`}>
      <div
        className="track-row"
        role="option"
        aria-selected={selected}
        tabIndex={0}
        data-track-id={track.id}
        onClick={() => onSelect(track)}
        onDoubleClick={() => onOpenDetails(track)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(track);
        }}
      >
        <button
          className="play-btn"
          disabled={missing}
          title={playing ? t('pause') : t('play')}
          aria-label={playing ? t('pause') : t('play')}
          onClick={(e) => {
            e.stopPropagation();
            if (selected) window.dispatchEvent(new Event(TOGGLE_PLAY_EVENT));
            else onSelect(track, true);
          }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <div className="track-main">
          <div className="track-title">
            <span className="track-name" title={track.path}>
              {track.name}
            </span>
            <SourceBadge track={track} />
            {status && <StatusBadge status={status} />}
            {missing && <span className="badge missing">{t('missingFile')}</span>}
          </div>
          <div className="track-meta">
            <span>{track.folder || '/'}</span>
            {ai && <span>{track.generation!.model}</span>}
            {track.generation?.tags?.map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
            {candidateCount !== undefined && candidateCount > 0 && (
              <span className="candidates-count">
                {t('candidatesCount', { count: candidateCount })}
                {chosenName && ` · ${t('chosenIs', { name: chosenName })}`}
              </span>
            )}
          </div>
        </div>

        <div className="mini-wave" aria-hidden="true">
          {wave.map((v, i) => (
            <span key={i} style={{ height: `${Math.round(v * 100)}%` }} />
          ))}
        </div>

        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
          {ai && (
            <div className="status-toggle" role="group" aria-label={t('status')}>
              {STATUS_ACTIONS.map(({ status: s, icon: Icon }) => (
                <button
                  key={s}
                  className={`icon-btn status-btn ${status === s ? `active status-${s}` : ''}`}
                  title={t(`status_${s}`)}
                  aria-pressed={status === s}
                  onClick={() => void actions.setStatus(track, s)}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          )}
          <button className="icon-btn" title={t('useAsBase')} disabled={missing} onClick={() => onUseAsBase(track)}>
            <Wand2 size={15} />
          </button>
          <a
            className={`icon-btn ${missing ? 'disabled' : ''}`}
            title={t('download')}
            aria-label={t('download')}
            href={missing ? undefined : api.downloadUrl(projectId, track.id)}
            download
          >
            <Download size={15} />
          </a>
          {ai && (
            <Menu
              label={t('moreActions')}
              trigger={<MoreHorizontal size={15} />}
              items={[
                { label: t('rename'), icon: Pencil, onSelect: () => void actions.rename(track) },
                { label: t('moveTo'), icon: FolderInput, onSelect: () => void actions.move(track) },
                { label: t('duplicate'), icon: Copy, onSelect: () => void actions.duplicate(track) },
                { label: t('linkOriginal'), icon: Link2, onSelect: () => void actions.linkOriginal(track) },
                { label: t('notesAndTags'), icon: Pencil, onSelect: () => onOpenDetails(track) },
                { label: t('delete'), icon: Trash2, danger: true, onSelect: () => void actions.remove(track) },
              ]}
            />
          )}
        </div>
      </div>
      {selected && !missing && (
        <div className="row-player">
          <AudioPlayer url={api.audioUrl(projectId, track.id)} autoPlay={autoPlay} />
        </div>
      )}
    </div>
  );
}
