import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '../api';

interface ProjectListProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (name: string, context?: string, defaultVocalsEnabled?: boolean) => void;
}

export function ProjectList({
  projects,
  selectedProject,
  onSelectProject,
  onCreateProject,
}: ProjectListProps) {
  const { t } = useTranslation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectContext, setNewProjectContext] = useState('');
  const [newProjectVocals, setNewProjectVocals] = useState(false);

  const handleCreate = () => {
    if (newProjectName.trim()) {
      onCreateProject(newProjectName, newProjectContext || undefined, newProjectVocals);
      setNewProjectName('');
      setNewProjectContext('');
      setNewProjectVocals(false);
      setShowCreateModal(false);
    }
  };

  return (
    <div style={{ padding: '20px', borderRight: '1px solid #ddd', minWidth: '250px' }}>
      <h2>{t('projects')}</h2>
      <button
        onClick={() => setShowCreateModal(true)}
        style={{ marginBottom: '10px', width: '100%' }}
      >
        {t('createProject')}
      </button>

      {projects.length === 0 ? (
        <p style={{ color: '#666', fontSize: '14px' }}>{t('noProjects')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => onSelectProject(project)}
              style={{
                padding: '10px',
                background: selectedProject?.id === project.id ? '#e3f2fd' : '#f9f9f9',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{project.name}</div>
              {project.context && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {project.context}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              minWidth: '300px',
            }}
          >
            <h3>{t('createProject')}</h3>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                {t('projectName')}
              </label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                {t('projectContext')}
              </label>
              <input
                type="text"
                value={newProjectContext}
                onChange={(e) => setNewProjectContext(e.target.value)}
                placeholder={t('projectContextPlaceholder')}
                style={{ width: '100%', padding: '8px' }}
              />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input
                  type="checkbox"
                  checked={newProjectVocals}
                  onChange={(e) => setNewProjectVocals(e.target.checked)}
                />
                {t('defaultVocalsEnabled')}
              </label>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateModal(false)}>{t('cancel')}</button>
              <button onClick={handleCreate}>{t('create')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
