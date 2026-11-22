import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { AudioTrack, EndingMode, Health, Project } from '../api';

/** Sound effects and voice pieces end; music and ambience loop (same rule as the server). */
function defaultEnding(folder: string): EndingMode {
  const type = folder.replace(/\\/g, '/').split('/').find(Boolean)?.toUpperCase();
  return type === 'SFX' || type === 'VO' ? 'ending' : 'loop';
}

export interface GenerateInput {
  prompt: string;
  vocalsEnabled: boolean;
  duration?: number;
  referenceTrackId?: string;
  outputFolder: string;
  refinePrompt?: boolean;
  ending: EndingMode;
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
  const [refine, setRefine] = useState(health?.generation.promptMode === 'refine');
  const [ending, setEnding] = useState<EndingMode>(defaultEnding(defaultFolder || 'SOUNDTRACK'));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setVocals(project.defaultVocalsEnabled);
    setResult(null);
  }, [project.id, project.defaultVocalsEnabled]);

  useEffect(() => {
    if (defaultFolder) setOutputFolder(defaultFolder);
  }, [defaultFolder]);

  useEffect(() => {
    setEnding(defaultEnding(outputFolder));
  }, [outputFolder]);

  useEffect(() => {
    setRefine(health?.generation.promptMode === 'refine');
  }, [health?.generation.promptMode]);

  const available = health?.generation.available ?? false;
  const refineAvailable = health?.generation.promptRefine?.enabled ?? false;
  const referenceReady = useReference && selectedTrack && selectedTrack.exists !== false;
  const loopSeconds = health?.generation.defaultLoopSeconds ?? 16;
  const seconds = duration ? Number(duration) : ending === 'loop' ? loopSeconds : undefined;
  const models = health?.generation.models;
  const model = models
    ? (models.override ?? (seconds && seconds <= (models.shortMaxSeconds ?? 29) ? models.short : models.long))
    : health?.generation.model;
  const trimOn = health?.generation.trimToDuration !== false;

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
        refinePrompt: refineAvailable ? refine : false,
        ending,
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
    <div className="inspector-section">
      {model && (
        <p className="muted small">
          {t('model')}: <strong>{model}</strong>
          {models && !models.override && <span> · {t('modelByDuration', { short: models.short, long: models.long, max: models.shortMaxSeconds ?? 29 })}</span>}
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

      <div className="row ending-row">
        <div className="segmented" role="group" aria-label={t('endingLabel')}>
          <button type="button" className={ending === 'loop' ? 'active' : ''} aria-pressed={ending === 'loop'} onClick={() => setEnding('loop')} disabled={busy}>
            {t('endingLoop')}
          </button>
          <button type="button" className={ending === 'ending' ? 'active' : ''} aria-pressed={ending === 'ending'} onClick={() => setEnding('ending')} disabled={busy}>
            {t('endingWithEnd')}
          </button>
        </div>
      </div>

      {refineAvailable && (
        <label className="switch">
          <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.target.checked)} disabled={busy} />
          <span>
            {t('refinePrompt')} <span className="muted">({health?.generation.promptRefine?.model})</span>
          </span>
        </label>
      )}
      <p className="muted small">{refine && refineAvailable ? t('refineHelp') : t('directHelp')}</p>

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
            placeholder={ending === 'loop' ? String(loopSeconds) : t('durationAuto')}
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
          {ending === 'loop'
            ? trimOn
              ? t('loopHint', { seconds, seam: health.generation.loopSeamSeconds ?? 0.25 })
              : t('durationHint')
            : seconds && trimOn
              ? t('endingHint', { seconds, fade: health.generation.fadeOutSeconds ?? 1.5 })
              : t('endingNoDuration')}
        </p>
      )}

      <button className="btn primary full" onClick={() => void submit()} disabled={!available || busy || !prompt.trim() || Boolean(useReference && !referenceReady)}>
        <Sparkles size={15} /> {busy ? t('generating') : t('generate')}
      </button>
      {result && <p className={result.ok ? 'ok-text' : 'error-text'}>{result.text}</p>}
    </div>
  );
}
