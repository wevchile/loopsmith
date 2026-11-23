import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderPen, FolderPlus, FolderX, Search } from 'lucide-react';
import { SOUND_TYPES, type AudioTrack, type SoundType } from '../api';
import type { LibraryActions } from '../actions';
import { TrackRow } from './TrackRow';
import { TOGGLE_PLAY_EVENT } from './AudioPlayer';
import { isModalOpen } from './Dialogs';

export type StatusFilter = 'all' | 'original' | 'candidate' | 'chosen' | 'discarded';
const STATUS_FILTERS: StatusFilter[] = ['all', 'original', 'candidate', 'chosen', 'discarded'];

interface Props {
  projectId: string;
  tracks: AudioTrack[];
  folders: string[];
  selectedFolder: string;
  onSelectFolder: (folder: string) => void;
  selectedTrackId: string | null;
  autoPlayId: string | null;
  actions: LibraryActions;
  onSelect: (track: AudioTrack | null, play?: boolean) => void;
  onUseAsBase: (track: AudioTrack) => void;
  onOpenDetails: (track: AudioTrack) => void;
}

interface OriginalGroup {
  original: AudioTrack;
  candidates: AudioTrack[];
}

function inFolder(track: AudioTrack, folder: string): boolean {
  if (!folder || track.source === 'manifest') return true;
  return track.folder === folder || track.folder.startsWith(`${folder}/`);
}

function statusMatches(track: AudioTrack, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'original') return track.source === 'manifest';
  return track.generation?.status === filter;
}

export function Library(props: Props) {
  const { projectId, tracks, folders, selectedFolder, onSelectFolder, selectedTrackId, autoPlayId, actions, onSelect, onUseAsBase, onOpenDetails } = props;
  const { t } = useTranslation();
  const [typeFilter, setTypeFilter] = useState<SoundType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const textMatches = (track: AudioTrack) =>
    !q ||
    track.name.toLowerCase().includes(q) ||
    track.folder.toLowerCase().includes(q) ||
    Boolean(track.generation?.tags?.some((tag) => tag.toLowerCase().includes(q))) ||
    Boolean(track.generation?.prompt.toLowerCase().includes(q));

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: tracks.length, original: 0, candidate: 0, chosen: 0, discarded: 0 };
    for (const tr of tracks) {
      if (tr.source === 'manifest') c.original++;
      if (tr.generation) c[tr.generation.status]++;
    }
    return c;
  }, [tracks]);

  /** Per type: originals with their linked AI candidates, then everything else. */
  const groups = useMemo(() => {
    const byOriginal = new Map<string, AudioTrack[]>();
    for (const tr of tracks) {
      const link = tr.generation?.originalTrackId;
      if (link) byOriginal.set(link, [...(byOriginal.get(link) ?? []), tr]);
    }
    const originalIds = new Set(tracks.filter((tr) => tr.source === 'manifest').map((tr) => tr.id));
    const base = (tr: AudioTrack) => (typeFilter === 'ALL' || tr.type === typeFilter) && inFolder(tr, selectedFolder);

    return SOUND_TYPES.map((type) => {
      const originals: OriginalGroup[] = [];
      for (const original of tracks.filter((tr) => tr.source === 'manifest' && tr.type === type)) {
        const allCandidates = byOriginal.get(original.id) ?? [];
        const candidates = allCandidates.filter((c) => statusMatches(c, statusFilter) && textMatches(c) && inFolder(c, selectedFolder));
        const selfVisible = base(original) && (statusFilter === 'all' || statusFilter === 'original') && textMatches(original);
        if (typeFilter !== 'ALL' && original.type !== typeFilter) continue;
        if (selfVisible || candidates.length > 0) originals.push({ original, candidates: statusFilter === 'original' ? [] : candidates });
      }
      const others = tracks.filter(
        (tr) =>
          tr.source !== 'manifest' &&
          tr.type === type &&
          !(tr.generation?.originalTrackId && originalIds.has(tr.generation.originalTrackId)) &&
          base(tr) &&
          statusMatches(tr, statusFilter) &&
          textMatches(tr)
      );
      return { type, originals, others, total: originals.reduce((n, g) => n + 1 + g.candidates.length, 0) + others.length };
    }).filter((g) => g.total > 0);
    // textMatches depends on q only.
  }, [tracks, typeFilter, statusFilter, selectedFolder, q]);

  const candidatesOf = (original: AudioTrack) => tracks.filter((tr) => tr.generation?.originalTrackId === original.id);

  // Keyboard: arrows move the selection, Space plays/pauses, Escape closes the player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (isModalOpen() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      const rows = [...document.querySelectorAll<HTMLElement>('.library .track-row')];
      const ids = rows.map((r) => r.dataset.trackId!);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const index = selectedTrackId ? ids.indexOf(selectedTrackId) : -1;
        const next = ids[Math.max(0, Math.min(ids.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))];
        const track = tracks.find((tr) => tr.id === next);
        if (track) {
          onSelect(track);
          rows[ids.indexOf(next!)]?.focus();
        }
      } else if (e.key === ' ' && selectedTrackId && target.tagName !== 'BUTTON') {
        e.preventDefault();
        window.dispatchEvent(new Event(TOGGLE_PLAY_EVENT));
      } else if (e.key === 'Escape' && selectedTrackId) {
        onSelect(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tracks, selectedTrackId, onSelect]);

  const row = (track: AudioTrack, extra: { nested?: boolean; candidateCount?: number; chosenName?: string } = {}) => (
    <TrackRow
      key={track.id}
      projectId={projectId}
      track={track}
      selected={track.id === selectedTrackId}
      autoPlay={track.id === autoPlayId}
      actions={actions}
      onSelect={(tr, play) => onSelect(tr.id === selectedTrackId ? null : tr, play)}
      onUseAsBase={onUseAsBase}
      onOpenDetails={onOpenDetails}
      {...extra}
    />
  );

  const folderLabel = selectedFolder || t('allFolders');

  return (
    <section className="library">
      <div className="library-toolbar">
        <div className="search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchTracks')} aria-label={t('searchTracks')} />
        </div>

        <div className="folder-bar" role="group" aria-label={t('folders')}>
          <FolderOpen size={14} className="muted-icon" />
          <select value={selectedFolder} onChange={(e) => onSelectFolder(e.target.value)} aria-label={t('folder')} title={folderLabel}>
            <option value="">{t('allFolders')}</option>
            {folders
              .filter((f) => f)
              .map((f) => (
                <option key={f} value={f}>
                  {'  '.repeat(f.split('/').length - 1)}
                  {f.split('/').pop()}
                </option>
              ))}
          </select>
          <button
            className="icon-btn"
            title={selectedFolder ? t('newSubfolder', { folder: selectedFolder }) : t('newFolder')}
            onClick={async () => {
              const created = await actions.newFolder(selectedFolder);
              if (created) onSelectFolder(created);
            }}
          >
            <FolderPlus size={15} />
          </button>
          <button
            className="icon-btn"
            title={t('renameFolder')}
            disabled={!selectedFolder}
            onClick={async () => {
              const renamed = await actions.renameFolder(selectedFolder);
              if (renamed) onSelectFolder(renamed);
            }}
          >
            <FolderPen size={15} />
          </button>
          <button
            className="icon-btn danger"
            title={t('deleteFolder')}
            disabled={!selectedFolder}
            onClick={async () => {
              if (await actions.deleteFolder(selectedFolder)) onSelectFolder('');
            }}
          >
            <FolderX size={15} />
          </button>
        </div>
      </div>

      <div className="library-filters">
        <div className="segmented" role="group" aria-label={t('type')}>
          {(['ALL', ...SOUND_TYPES] as const).map((type) => (
            <button key={type} className={typeFilter === type ? 'active' : ''} aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>
              {type === 'ALL' ? t('filterAll') : type}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label={t('status')}>
          {STATUS_FILTERS.map((s) => (
            <button key={s} className={`${statusFilter === s ? 'active' : ''} f-${s}`} aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? t('filterAll') : s === 'original' ? t('originals') : t(`status_${s}_plural`)}
              <span className="count">{counts[s]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="library-list" role="listbox" aria-label={t('tracks')}>
        {groups.length === 0 && <p className="empty-state">{tracks.length === 0 ? t('noTracks') : t('noMatches')}</p>}
        {groups.map((group) => (
          <div key={group.type} className="type-group">
            <div className="type-header">
              <span className={`type-dot type-${group.type}`} />
              <h4>{group.type}</h4>
              <span className="count">{group.total}</span>
              <button
                className="icon-btn subtle"
                title={t('newSubfolder', { folder: group.type })}
                onClick={async () => {
                  const created = await actions.newFolder(group.type);
                  if (created) onSelectFolder(created);
                }}
              >
                <FolderPlus size={14} />
              </button>
            </div>
            {group.originals.map(({ original, candidates }) => {
              const all = candidatesOf(original);
              const chosen = all.find((c) => c.generation?.status === 'chosen');
              return (
                <div key={original.id} className="original-group">
                  {row(original, { candidateCount: all.length, chosenName: chosen?.name })}
                  {candidates.length > 0 && <div className="candidates">{candidates.map((c) => row(c, { nested: true }))}</div>}
                </div>
              );
            })}
            {group.others.map((tr) => row(tr))}
          </div>
        ))}
      </div>
    </section>
  );
}
