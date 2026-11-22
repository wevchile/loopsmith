import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project, Provider, AudioTrack } from '../api';

interface GenerationPanelProps {
  project: Project;
  providers: Provider[];
  referenceTrack: AudioTrack | null;
  onGenerate: (params: {
    providerId: string;
    prompt: string;
    vocalsEnabled: boolean;
    duration?: number;
    referenceTrackPath?: string;
    outputFolder: string;
  }) => Promise<void>;
  onClearReference: () => void;
}

export function GenerationPanel({
  project,
  providers,
  referenceTrack,
  onGenerate,
  onClearReference,
}: GenerationPanelProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [vocalsEnabled, setVocalsEnabled] = useState(project.defaultVocalsEnabled);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [outputFolder, setOutputFolder] = useState('SOUNDTRACK');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState(providers[0]?.id || '');

  const handleGenerate = async () => {
    if (!prompt.trim() || !selectedProviderId) return;

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
    } catch (error) {
      console.error('Generation failed:', error);
      alert(`${t('generationFailed')}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (providers.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
        <p style={{ color: 'red' }}>{t('noProviders')}</p>
      </div>
    );
  }

  const selectedProvider = providers.find(p => p.id === selectedProviderId);

  return (
    <div style={{ padding: '20px' }}>
      <h3>{t('generate')}</h3>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Provider</label>
        <select
          value={selectedProviderId}
          onChange={(e) => setSelectedProviderId(e.target.value)}
          style={{ width: '100%', padding: '8px' }}
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>{t('prompt')}</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('promptPlaceholder')}
          style={{ width: '100%', padding: '8px', minHeight: '80px' }}
          disabled={isGenerating}
        />
      </div>

      {referenceTrack && (
        <div
          style={{
            marginBottom: '10px',
            padding: '10px',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{t('referenceTrack')}:</strong> {referenceTrack.name}
            </div>
            <button onClick={onClearReference} disabled={isGenerating}>
              {t('clearReference')}
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            This will generate a variant based on the reference track's characteristics
          </div>
        </div>
      )}

      {selectedProvider?.capabilities.supportsVocals && (
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="checkbox"
              checked={vocalsEnabled}
              onChange={(e) => setVocalsEnabled(e.target.checked)}
              disabled={isGenerating}
            />
            {t('vocalsEnabled')}
          </label>
        </div>
      )}

      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>{t('duration')}</label>
        <input
          type="number"
          value={duration || ''}
          onChange={(e) => setDuration(e.target.value ? parseInt(e.target.value, 10) : undefined)}
          placeholder="Optional"
          min="10"
          max={selectedProvider?.capabilities.maxDurationSeconds || 180}
          style={{ width: '100%', padding: '8px' }}
          disabled={isGenerating}
        />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>{t('outputFolder')}</label>
        <select
          value={outputFolder}
          onChange={(e) => setOutputFolder(e.target.value)}
          style={{ width: '100%', padding: '8px' }}
          disabled={isGenerating}
        >
          <option value="SOUNDTRACK">SOUNDTRACK</option>
          <option value="SFX">SFX</option>
          <option value="VO">VO</option>
          <option value="AMBIENCE">AMBIENCE</option>
          <option value="OTHER">OTHER</option>
        </select>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
        style={{ width: '100%', padding: '10px' }}
      >
        {isGenerating ? t('generating') : t('generate')}
      </button>
    </div>
  );
}
