import { useTranslation } from 'react-i18next';
import { ApiError, api, type AudioTrack, type TrackStatus } from './api';
import { useDialogs } from './components/Dialogs';

interface Options {
  projectId: string;
  folders: string[];
  originals: AudioTrack[];
  /** Reloads tracks, history and folders. */
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

/** Folder and AI track actions shared by the library rows, the inspector and the settings modal. */
export function useLibraryActions({ projectId, folders, originals, onChanged, onError }: Options) {
  const { t } = useTranslation();
  const dialogs = useDialogs();

  const run = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    try {
      const result = await action();
      await onChanged();
      return result;
    } catch (e) {
      onError((e as Error).message);
      return undefined;
    }
  };

  const genId = (track: AudioTrack) => {
    if (!track.generationId) throw new Error('Not an AI track');
    return track.generationId;
  };
  const stem = (name: string) => name.replace(/\.[a-z0-9]+$/i, '');

  return {
    setStatus: (track: AudioTrack, status: TrackStatus) => run(() => api.updateGeneration(projectId, genId(track), { status })),

    linkOriginal: async (track: AudioTrack) => {
      const value = await dialogs.prompt({
        title: t('linkOriginal'),
        label: t('linkOriginalHelp'),
        defaultValue: track.generation?.originalTrackId ?? '',
        options: [{ value: '', label: t('noOriginal') }, ...originals.map((o) => ({ value: o.id, label: `${o.name} (${o.folder || '/'})` }))],
        confirmLabel: t('save'),
      });
      if (value === null) return;
      await run(() => api.updateGeneration(projectId, genId(track), { originalTrackId: value || null }));
    },

    saveMeta: (track: AudioTrack, meta: { notes: string; tags: string[] }) => run(() => api.updateGeneration(projectId, genId(track), meta)),

    rename: async (track: AudioTrack) => {
      const name = await dialogs.prompt({ title: t('renameTrack'), label: t('newName'), defaultValue: stem(track.name), confirmLabel: t('rename') });
      if (name && name !== stem(track.name)) await run(() => api.renameGeneration(projectId, genId(track), name));
    },

    move: async (track: AudioTrack) => {
      const folder = await dialogs.prompt({
        title: t('moveTrack'),
        label: t('targetFolder'),
        defaultValue: track.folder,
        options: folders.map((f) => ({ value: f, label: f || t('projectRoot') })),
        confirmLabel: t('move'),
      });
      if (folder !== null && folder !== track.folder) await run(() => api.moveGeneration(projectId, genId(track), folder));
    },

    duplicate: (track: AudioTrack) => run(() => api.duplicateGeneration(projectId, genId(track))),

    remove: async (track: AudioTrack) => {
      const ok = await dialogs.confirm({ title: t('deleteTrack'), message: t('deleteTrackConfirm', { name: track.name }), confirmLabel: t('delete'), danger: true });
      if (ok) await run(() => api.deleteGeneration(projectId, genId(track)));
      return ok;
    },

    newFolder: async (parent: string) => {
      const name = await dialogs.prompt({ title: t('newFolder'), label: parent ? t('insideFolder', { folder: parent }) : t('folderNamePrompt'), confirmLabel: t('create') });
      if (!name) return undefined;
      const created = await run(() => api.createFolder(projectId, parent, name));
      return created ? (parent ? `${parent}/${name}` : name) : undefined;
    },

    renameFolder: async (folder: string) => {
      const current = folder.split('/').pop() ?? folder;
      const name = await dialogs.prompt({ title: t('renameFolder'), label: t('newName'), defaultValue: current, confirmLabel: t('rename') });
      if (!name || name === current) return undefined;
      const result = await run(() => api.renameFolder(projectId, folder, name));
      return result ? folder.replace(/[^/]+$/, name) : undefined;
    },

    deleteFolder: async (folder: string) => {
      if (!(await dialogs.confirm({ title: t('deleteFolder'), message: t('deleteFolderConfirm', { path: folder }), confirmLabel: t('delete'), danger: true }))) return false;
      try {
        await api.deleteFolder(projectId, folder, false);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'FOLDER_NOT_EMPTY') {
          const ok = await dialogs.confirm({ title: t('deleteFolder'), message: t('deleteFolderNotEmpty', { path: folder }), confirmLabel: t('deleteAll'), danger: true });
          if (!ok) return false;
          try {
            await api.deleteFolder(projectId, folder, true);
          } catch (e2) {
            onError((e2 as Error).message);
            return false;
          }
        } else {
          onError((e as Error).message);
          return false;
        }
      }
      await onChanged();
      return true;
    },
  };
}

export type LibraryActions = ReturnType<typeof useLibraryActions>;
