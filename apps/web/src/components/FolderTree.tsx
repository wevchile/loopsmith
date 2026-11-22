import { useTranslation } from 'react-i18next';
import { Folder, FolderPen, FolderPlus, FolderX } from 'lucide-react';
import type { FolderNode } from '../api';
import type { LibraryActions } from '../actions';

interface Props {
  tree: FolderNode | null;
  selectedFolder: string;
  onSelect: (path: string) => void;
  actions: LibraryActions;
}

/** Full folder tree with create, rename and delete (settings modal, "Folders" tab). */
export function FolderTree({ tree, selectedFolder, onSelect, actions }: Props) {
  const { t } = useTranslation();

  const renderNode = (node: FolderNode, depth: number) => (
    <li key={node.path || '__root'}>
      <div className={`folder-row ${selectedFolder === node.path ? 'selected' : ''}`} style={{ paddingLeft: 8 + depth * 16 }}>
        <button className="folder-name" onClick={() => onSelect(node.path)} title={node.path || t('projectRoot')}>
          <Folder size={14} />
          {depth === 0 ? t('projectRoot') : node.name}
        </button>
        <span className="folder-actions">
          <button className="icon-btn" title={t('newSubfolder', { folder: node.path || t('projectRoot') })} onClick={() => void actions.newFolder(node.path)}>
            <FolderPlus size={14} />
          </button>
          {depth > 0 && (
            <>
              <button className="icon-btn" title={t('renameFolder')} onClick={() => void actions.renameFolder(node.path)}>
                <FolderPen size={14} />
              </button>
              <button
                className="icon-btn danger"
                title={t('deleteFolder')}
                onClick={async () => {
                  if ((await actions.deleteFolder(node.path)) && (selectedFolder === node.path || selectedFolder.startsWith(`${node.path}/`))) onSelect('');
                }}
              >
                <FolderX size={14} />
              </button>
            </>
          )}
        </span>
      </div>
      {node.children.length > 0 && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <div className="settings-section">
      <p className="muted small">{t('foldersHelp')}</p>
      {tree && <ul className="folder-tree">{renderNode(tree, 0)}</ul>}
    </div>
  );
}
