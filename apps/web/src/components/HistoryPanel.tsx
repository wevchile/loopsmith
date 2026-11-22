import { useTranslation } from 'react-i18next';
import type { GenerationHistory } from '../api';

interface Props {
  history: GenerationHistory[];
  onSelectTrack: (trackId: string) => void;
}

export function HistoryPanel({ history, onSelectTrack }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <section className="panel">
      <h3>{t('history')}</h3>
      {history.length === 0 && <p className="muted">{t('noHistory')}</p>}
      <ul className="history">
        {history.map((h) => (
          <li key={h.id} onClick={() => h.outputTrackId && onSelectTrack(h.outputTrackId)}>
            <div className="small muted">
              {new Date(h.timestamp).toLocaleString(i18n.resolvedLanguage)} · {h.model} ·{' '}
              {h.vocalsEnabled ? t('withVocals') : t('instrumental')}
            </div>
            <div>{h.prompt}</div>
            {h.referenceTrackId && (
              <div className="small muted">
                {t('basedOn')} {h.referenceTrackId.replace(/^(local|manifest):/, '')}
              </div>
            )}
            {h.audio?.finalSeconds !== undefined && (
              <div className="small muted">
                {h.audio.trimmed
                  ? t('trimmedFrom', { final: h.audio.finalSeconds.toFixed(1), generated: h.audio.generatedSeconds?.toFixed(1) })
                  : t('lengthSeconds', { seconds: h.audio.finalSeconds.toFixed(1) })}
              </div>
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
    </section>
  );
}
