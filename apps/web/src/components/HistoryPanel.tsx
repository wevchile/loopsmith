import { useTranslation } from 'react-i18next';
import type { GenerationHistory } from '../api';
import { StatusBadge } from './StatusBadge';

interface Props {
  history: GenerationHistory[];
  onSelectTrack: (trackId: string) => void;
}

export function HistoryPanel({ history, onSelectTrack }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <div className="inspector-section">
      {history.length === 0 && <p className="muted">{t('noHistory')}</p>}
      <ul className="history">
        {history.map((h) => (
          <li key={h.id} onClick={() => h.outputTrackId && onSelectTrack(h.outputTrackId)}>
            <div className="small muted">
              {new Date(h.timestamp).toLocaleString(i18n.resolvedLanguage)} · {h.model} ·{' '}
              {h.vocalsEnabled ? t('withVocals') : t('instrumental')}
            </div>
            {h.status && <StatusBadge status={h.status} />}
            {h.promptMode && <span className="badge mode">{h.promptMode === 'refine' ? t('modeRefine') : t('modeDirect')}</span>}
            {h.ending && <span className="badge mode">{h.ending === 'loop' ? t('endingLoop') : t('endingWithEnd')}</span>}
            <div>{h.prompt}</div>
            {h.referenceTrackId && (
              <div className="small muted">
                {t('basedOn')} {h.referenceTrackId.replace(/^(local|manifest):/, '')}
              </div>
            )}
            {h.audio?.finalSeconds !== undefined && (
              <div className="small muted">
                {h.audio.trimmed
                  ? h.audio.lengthMethod === 'loop-seam'
                    ? t('loopFrom', { final: h.audio.finalSeconds.toFixed(1), generated: h.audio.generatedSeconds?.toFixed(1), seam: h.audio.seamSeconds })
                    : t('trimmedFrom', { final: h.audio.finalSeconds.toFixed(1), generated: h.audio.generatedSeconds?.toFixed(1) })
                  : t('lengthSeconds', { seconds: h.audio.finalSeconds.toFixed(1) })}
              </div>
            )}
            {h.refinement?.status === 'failed' && <div className="small error-text">{t('refineFailed')}</div>}
            {(h.finalPrompt || h.refinedPrompt) && (
              <details className="small" onClick={(e) => e.stopPropagation()}>
                <summary>{t('promptsTitle')}</summary>
                <div className="prompt-compare">
                  <div className="muted">{t('yourPrompt')}</div>
                  <pre className="lyrics">{h.prompt}</pre>
                  {h.refinement?.status === 'refined' && h.refinedPrompt && (
                    <>
                      <div className="muted">{t('refinedPrompt', { model: h.refinement.model })}</div>
                      <pre className="lyrics">{h.refinedPrompt}</pre>
                    </>
                  )}
                  <div className="muted">{t('sentPrompt')}</div>
                  <pre className="lyrics">{h.finalPrompt ?? h.refinedPrompt}</pre>
                </div>
              </details>
            )}
            {h.lyrics && (
              <details className="small" onClick={(e) => e.stopPropagation()}>
                <summary>{t('lyrics')}</summary>
                <pre className="lyrics">{h.lyrics}</pre>
              </details>
            )}
            <div className="small path">{h.outputTrackId?.replace(/^local:/, '') ?? h.outputPath}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
