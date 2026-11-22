import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { ProjectList } from './components/ProjectList';
import { GenerationPanel } from './components/GenerationPanel';
import { TrackList } from './components/TrackList';
import { LanguageSwitcher } from './components/LanguageSwitcher';
export function App() {
    const { t } = useTranslation();
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [selectedTrack, setSelectedTrack] = useState(null);
    const [referenceTrack, setReferenceTrack] = useState(null);
    const [providers, setProviders] = useState([]);
    const [apiKeyConfigured, setApiKeyConfigured] = useState(true);
    useEffect(() => {
        loadProjects();
        loadProviders();
        checkHealth();
    }, []);
    useEffect(() => {
        if (selectedProject) {
            loadTracks(selectedProject.id);
        }
        else {
            setTracks([]);
            setSelectedTrack(null);
        }
    }, [selectedProject]);
    async function checkHealth() {
        try {
            const health = await api.getHealth();
            setApiKeyConfigured(health.apiKeyConfigured);
        }
        catch (error) {
            console.error('Health check failed:', error);
        }
    }
    async function loadProjects() {
        try {
            const data = await api.getProjects();
            setProjects(data);
        }
        catch (error) {
            console.error('Failed to load projects:', error);
        }
    }
    async function loadProviders() {
        try {
            const data = await api.getProviders();
            setProviders(data);
        }
        catch (error) {
            console.error('Failed to load providers:', error);
        }
    }
    async function loadTracks(projectId) {
        try {
            const data = await api.getProjectTracks(projectId);
            setTracks(data);
        }
        catch (error) {
            console.error('Failed to load tracks:', error);
        }
    }
    async function handleCreateProject(name, context, defaultVocalsEnabled) {
        try {
            const project = await api.createProject(name, context, defaultVocalsEnabled);
            setProjects([...projects, project]);
            setSelectedProject(project);
        }
        catch (error) {
            console.error('Failed to create project:', error);
            alert('Failed to create project');
        }
    }
    async function handleGenerate(params) {
        if (!selectedProject)
            return;
        await api.generate({
            projectId: selectedProject.id,
            ...params,
        });
        await loadTracks(selectedProject.id);
        setReferenceTrack(null);
    }
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', height: '100vh' }, children: [_jsxs("header", { style: {
                    padding: '10px 20px',
                    background: '#1e73be',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }, children: [_jsx("h1", { style: { margin: 0 }, children: t('appName') }), _jsx(LanguageSwitcher, {})] }), !apiKeyConfigured && (_jsx("div", { style: {
                    padding: '10px 20px',
                    background: '#fff3cd',
                    border: '1px solid #ffc107',
                    color: '#856404',
                }, children: t('apiKeyMissing') })), _jsxs("div", { style: { display: 'flex', flex: 1, overflow: 'hidden' }, children: [_jsx(ProjectList, { projects: projects, selectedProject: selectedProject, onSelectProject: setSelectedProject, onCreateProject: handleCreateProject }), _jsx("div", { style: { flex: 1, display: 'flex', overflow: 'hidden' }, children: selectedProject ? (_jsxs(_Fragment, { children: [_jsx("div", { style: { flex: 1, overflowY: 'auto', borderRight: '1px solid #ddd' }, children: _jsx(TrackList, { tracks: tracks, selectedTrack: selectedTrack, onSelectTrack: setSelectedTrack, onSetReference: setReferenceTrack }) }), _jsx("div", { style: { width: '400px', overflowY: 'auto', borderLeft: '1px solid #ddd' }, children: _jsx(GenerationPanel, { project: selectedProject, providers: providers, referenceTrack: referenceTrack, onGenerate: handleGenerate, onClearReference: () => setReferenceTrack(null) }) })] })) : (_jsx("div", { style: {
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#666',
                            }, children: t('selectProject') })) })] })] }));
}
