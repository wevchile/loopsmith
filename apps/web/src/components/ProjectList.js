import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
export function ProjectList({ projects, selectedProject, onSelectProject, onCreateProject, }) {
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
    return (_jsxs("div", { style: { padding: '20px', borderRight: '1px solid #ddd', minWidth: '250px' }, children: [_jsx("h2", { children: t('projects') }), _jsx("button", { onClick: () => setShowCreateModal(true), style: { marginBottom: '10px', width: '100%' }, children: t('createProject') }), projects.length === 0 ? (_jsx("p", { style: { color: '#666', fontSize: '14px' }, children: t('noProjects') })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: '5px' }, children: projects.map((project) => (_jsxs("div", { onClick: () => onSelectProject(project), style: {
                        padding: '10px',
                        background: selectedProject?.id === project.id ? '#e3f2fd' : '#f9f9f9',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                    }, children: [_jsx("div", { style: { fontWeight: 'bold' }, children: project.name }), project.context && (_jsx("div", { style: { fontSize: '12px', color: '#666', marginTop: '4px' }, children: project.context }))] }, project.id))) })), showCreateModal && (_jsx("div", { style: {
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
                }, children: _jsxs("div", { style: {
                        background: 'white',
                        padding: '20px',
                        borderRadius: '8px',
                        minWidth: '300px',
                    }, children: [_jsx("h3", { children: t('createProject') }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("label", { style: { display: 'block', marginBottom: '5px' }, children: t('projectName') }), _jsx("input", { type: "text", value: newProjectName, onChange: (e) => setNewProjectName(e.target.value), style: { width: '100%', padding: '8px' } })] }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("label", { style: { display: 'block', marginBottom: '5px' }, children: t('projectContext') }), _jsx("input", { type: "text", value: newProjectContext, onChange: (e) => setNewProjectContext(e.target.value), placeholder: t('projectContextPlaceholder'), style: { width: '100%', padding: '8px' } })] }), _jsx("div", { style: { marginBottom: '10px' }, children: _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: '5px' }, children: [_jsx("input", { type: "checkbox", checked: newProjectVocals, onChange: (e) => setNewProjectVocals(e.target.checked) }), t('defaultVocalsEnabled')] }) }), _jsxs("div", { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end' }, children: [_jsx("button", { onClick: () => setShowCreateModal(false), children: t('cancel') }), _jsx("button", { onClick: handleCreate, children: t('create') })] })] }) }))] }));
}
