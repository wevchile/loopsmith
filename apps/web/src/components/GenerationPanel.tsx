import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AudioTrack, Health, Project } from '../api';

export interface GenerateInput {
  prompt: string;
  vocalsEnabled: boolean;
  duration?: number;
  referenceTrackId?: string;
  outputFolder: string;
  refinePrompt?: boolean;
}

interface Props {
  project: Project;
  health: Health | null;
  folders: string[];
  defaultFolder: string;
  selectedTrack: AudioTrack | null;
  useReference: boolean;
  onUseReferenceChange: (value: boolean) => void;
  onGenerate: (input: GenerateInput) => Promise<string>;
}

export function GenerationPanel({
  project,
  health,
  folders,
  defaultFolder,
  selectedTrack,
  useReference,
  onUseReferenceChange,
  onGenerate,
}: Props) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [vocals, setVocals] = useState(project.defaultVocalsEnabled);
  const [duration, setDuration] = useState('');
  const [outputFolder, setOutputFolder] = useState(defaultFolder || 'SOUNDTRACK');
  const [refine, setRefine] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setVocals(project.defaultVocalsEnabled);
    setResult(null);
  }, [project.id, project.defaultVocalsEnabled]);

  useEffect(() => {
    if (defaultFolder) setOutputFolder(defaultFolder);
  }, [defaultFolder]);

  const available = health?.generation.available ?? false;
  const refineAvailable = health?.generation.promptRefine?.enabled ?? false;
  const referenceReady = useReference && selectedTrack && selectedTrack.exists !== false;

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const file = await onGenerate({
        prompt,
        vocalsEnabled: vocals,
        duration: duration ? Number(duration) : undefined,
        referenceTrackId: referenceReady ? selectedTrack.id : undefined,
        outputFolder,
        refinePrompt: refineAvailable ? refine : undefined,
      });
      setResult({ ok: true, text: t('generationDone', { file }) });
      setPrompt('');
    } catch (e) {
      setResult({ ok: false, text: `${t('errorPrefix')}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h3>{t('generate')}</h3>
      {health?.generation.model && (
        <p className="muted small">
          {t('model')}: {health.generation.model}
        </p>
      )}
      <label>
        {t('prompt')}
        <textarea value={prompt} placeholder={t('promptPlaceholder')} onChange={(e) => setPrompt(e.target.value)} disabled={busy} rows={4} />
      </label>
      {project.context && <p className="muted small">+ {project.context}</p>}

      <label className="switch">
        <input type="checkbox" checked={vocals} onChange={(e) => setVocals(e.target.checked)} disabled={busy} />
        <span>
          {t('vocals')} <span className="muted">({vocals ? t('withVocals') : t('instrumentalOnly')})</span>
        </span>
      </label>

      {refineAvailable && (
        <label className="switch">
          <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.target.checked)} disabled={busy} />
          <span>
            {t('refinePrompt')} <span className="muted">({health?.generation.promptRefine?.model})</span>
          </span>
        </label>
      )}

      <label className="switch">
        <input type="checkbox" checked={useReference} onChange={(e) => onUseReferenceChange(e.target.checked)} disabled={busy} />
        <span>{t('useReference')}</span>
      </label>
      {useReference && (
        <div className="banner info small">
          {selectedTrack ? <strong>{selectedTrack.name}</strong> : t('noTrackSelected')}
          <div>{t('referenceHelp')}</div>
        </div>
      )}

      <div className="row">
        <label>
          {t('duration')}
          <input
            type="number"
            min={1}
            max={health?.generation.maxDurationSeconds || 240}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          {t('outputFolder')}
          <select value={outputFolder} onChange={(e) => setOutputFolder(e.target.value)} disabled={busy}>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f || '/'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {health?.generation.available && (
        <p className="muted small">
          {health.generation.fixedDurationSeconds
            ? t('durationFixed', { seconds: health.generation.fixedDurationSeconds })
            : t('durationHint')}
          {health.generation.trimToDuration !== false && duration ? ` ${t('durationTrim', { seconds: duration })}` : ''}
        </p>
      )}

      <button className="full" onClick={() => void submit()} disabled={!available || busy || !prompt.trim() || Boolean(useReference && !referenceReady)}>
        {busy ? t('generating') : t('generate')}
      </button>
      {result && <p className={result.ok ? 'ok-text' : 'error-text'}>{result.text}</p>}
    </section>
  );
}
