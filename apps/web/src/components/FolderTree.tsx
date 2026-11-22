import { useTranslation } from 'react-i18next';
import { ApiError, api, type FolderNode } from '../api';

interface Props {
  projectId: string;
  tree: FolderNode | null;
  selectedFolder: string;
  onSelect: (path: string) => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

export function FolderTree({ projectId, tree, selectedFolder, onSelect, onChanged, onError }: Props) {
  const { t } = useTranslation();

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const createIn = (parent: string) => {
    const name = window.prompt(t('folderNamePrompt'));
    if (name?.trim()) void run(() => api.createFolder(projectId, parent, name.trim()));
  };

  const renameFolder = (node: FolderNode) => {
    const newName = window.prompt(t('renamePrompt'), node.name);
    if (newName?.trim() && newName !== node.name) void run(() => api.renameFolder(projectId, node.path, newName.trim()));
  };

  const deleteFolder = (node: FolderNode) => {
    if (!window.confirm(t('deleteFolderConfirm', { path: node.path }))) return;
    void run(async () => {
      try {
        await api.deleteFolder(projectId, node.path, false);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'FOLDER_NOT_EMPTY' && window.confirm(t('deleteFolderNotEmpty', { path: node.path }))) {
          await api.deleteFolder(projectId, node.path, true);
        } else {
          throw e;
        }
      }
      if (selectedFolder === node.path || selectedFolder.startsWith(`${node.path}/`)) onSelect('');
    });
  };

  const renderNode = (node: FolderNode, depth: number) => (
    <li key={node.path || '__root'}>
      <div className={`folder-row ${selectedFolder === node.path ? 'selected' : ''}`} style={{ paddingLeft: depth * 14 }}>
        <span className="folder-name" onClick={() => onSelect(node.path)} title={node.path || t('projectRoot')}>
          {depth === 0 ? t('projectRoot') : node.name}
        </span>
        <span className="folder-actions">
          <button className="icon" title={t('newFolder')} onClick={() => createIn(node.path)}>
            +
          </button>
          {depth > 0 && (
            <>
              <button className="icon" title={t('rename')} onClick={() => renameFolder(node)}>
                ✎
              </button>
              <button className="icon danger" title={t('delete')} onClick={() => deleteFolder(node)}>
                ×
              </button>
            </>
          )}
        </span>
      </div>
      {node.children.length > 0 && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <section className="panel">
      <h3>{t('folders')}</h3>
      {tree && <ul className="folder-tree">{renderNode(tree, 0)}</ul>}
    </section>
  );
}
