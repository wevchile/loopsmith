import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
export function GenerationPanel({ project, providers, referenceTrack, onGenerate, onClearReference, }) {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState('');
    const [vocalsEnabled, setVocalsEnabled] = useState(project.defaultVocalsEnabled);
    const [duration, setDuration] = useState(undefined);
    const [outputFolder, setOutputFolder] = useState('SOUNDTRACK');
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedProviderId, setSelectedProviderId] = useState(providers[0]?.id || '');
    const handleGenerate = async () => {
        if (!prompt.trim() || !selectedProviderId)
            return;
        setIsGenerating(true);
        try {
            await onGenerate({
                providerId: selectedProviderId,
                prompt,
                vocalsEnabled,
                duration,
                referenceTrackPath: referenceTrack?.path,
                outputFolder,
            });
            setPrompt('');
        }
        catch (error) {
            console.error('Generation failed:', error);
            alert(`${t('generationFailed')}: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            setIsGenerating(false);
        }
    };
    if (providers.length === 0) {
        return (_jsx("div", { style: { padding: '20px' }, children: _jsx("p", { style: { color: 'red' }, children: t('noProviders') }) }));
    }
    const selectedProvider = providers.find(p => p.id === selectedProviderId);
    return (_jsxs("div", { style: { padding: '20px' }, children: [_jsx("h3", { children: t('generate') }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("label", { style: { display: 'block', marginBottom: '5px' }, children: "Provider" }), _jsx("select", { value: selectedProviderId, onChange: (e) => setSelectedProviderId(e.target.value), style: { width: '100%', padding: '8px' }, children: providers.map((provider) => (_jsx("option", { value: provider.id, children: provider.name }, provider.id))) })] }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("label", { style: { display: 'block', marginBottom: '5px' }, children: t('prompt') }), _jsx("textarea", { value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: t('promptPlaceholder'), style: { width: '100%', padding: '8px', minHeight: '80px' }, disabled: isGenerating })] }), referenceTrack && (_jsxs("div", { style: {
                    marginBottom: '10px',
                    padding: '10px',
                    background: '#fff3cd',
                    border: '1px solid #ffc107',
                    borderRadius: '4px',
                }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { children: [_jsxs("strong", { children: [t('referenceTrack'), ":"] }), " ", referenceTrack.name] }), _jsx("button", { onClick: onClearReference, disabled: isGenerating, children: t('clearReference') })] }), _jsx("div", { style: { fontSize: '12px', color: '#666', marginTop: '5px' }, children: "This will generate a variant based on the reference track's characteristics" })] })), selectedProvider?.capabilities.supportsVocals && (_jsx("div", { style: { marginBottom: '10px' }, children: _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: '5px' }, children: [_jsx("input", { type: "checkbox", checked: vocalsEnabled, onChange: (e) => setVocalsEnabled(e.target.checked), disabled: isGenerating }), t('vocalsEnabled')] }) })), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("label", { style: { display: 'block', marginBottom: '5px' }, children: t('duration') }), _jsx("input", { type: "number", value: duration || '', onChange: (e) => setDuration(e.target.value ? parseInt(e.target.value, 10) : undefined), placeholder: "Optional", min: "10", max: selectedProvider?.capabilities.maxDurationSeconds || 180, style: { width: '100%', padding: '8px' }, disabled: isGenerating })] }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("label", { style: { display: 'block', marginBottom: '5px' }, children: t('outputFolder') }), _jsxs("select", { value: outputFolder, onChange: (e) => setOutputFolder(e.target.value), style: { width: '100%', padding: '8px' }, disabled: isGenerating, children: [_jsx("option", { value: "SOUNDTRACK", children: "SOUNDTRACK" }), _jsx("option", { value: "SFX", children: "SFX" }), _jsx("option", { value: "VO", children: "VO" }), _jsx("option", { value: "AMBIENCE", children: "AMBIENCE" }), _jsx("option", { value: "OTHER", children: "OTHER" })] })] }), _jsx("button", { onClick: handleGenerate, disabled: isGenerating || !prompt.trim(), style: { width: '100%', padding: '10px' }, children: isGenerating ? t('generating') : t('generate') })] }));
}
