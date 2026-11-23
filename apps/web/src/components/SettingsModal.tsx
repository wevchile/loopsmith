import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileJson, FolderTree as FolderTreeIcon, SlidersHorizontal } from 'lucide-react';
import type { FolderNode, Project } from '../api';
import type { LibraryActions } from '../actions';
import { Modal } from './Dialogs';
import { ProjectSettings } from './ProjectSettings';
import { ManifestPanel } from './ManifestPanel';
import { FolderTree } from './FolderTree';

export type SettingsTab = 'project' | 'manifest' | 'folders';

interface Props {
  project: Project;
  initialTab?: SettingsTab;
  tree: FolderNode | null;
  selectedFolder: string;
  onSelectFolder: (folder: string) => void;
  actions: LibraryActions;
  onSave: (changes: { name: string; context: string; defaultVocalsEnabled: boolean }) => Promise<void>;
  onRemove: () => Promise<void>;
  onProjectChange: (project: Project) => Promise<void>;
  onClose: () => void;
}

/** Project settings, game manifest and folders, opened from the gear button in the header. */
export function SettingsModal(props: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>(props.initialTab ?? 'project');
  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof FileJson }> = [
    { id: 'project', label: t('settings'), icon: SlidersHorizontal },
    { id: 'manifest', label: t('manifest'), icon: FileJson },
    { id: 'folders', label: t('folders'), icon: FolderTreeIcon },
  ];

  return (
    <Modal title={`${t('settings')} · ${props.project.name}`} onClose={props.onClose} size="large">
      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-orientation="vertical">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>
        <div className="settings-content" role="tabpanel">
          {tab === 'project' && <ProjectSettings project={props.project} onSave={props.onSave} onRemove={props.onRemove} />}
          {tab === 'manifest' && <ManifestPanel project={props.project} onProjectChange={props.onProjectChange} />}
          {tab === 'folders' && <FolderTree tree={props.tree} selectedFolder={props.selectedFolder} onSelect={props.onSelectFolder} actions={props.actions} />}
        </div>
      </div>
    </Modal>
  );
}
