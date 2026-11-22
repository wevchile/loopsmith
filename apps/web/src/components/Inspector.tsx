import { useTranslation } from 'react-i18next';
import { History, Info, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

export type InspectorTab = 'generate' | 'track' | 'history';

interface Props {
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  historyCount: number;
  generate: ReactNode;
  track: ReactNode;
  history: ReactNode;
}

/** Collapsible side panel: generation, details of the selected track and history. */
export function Inspector({ tab, onTabChange, historyCount, generate, track, history }: Props) {
  const { t } = useTranslation();
  const tabs: Array<{ id: InspectorTab; label: string; icon: typeof Info; badge?: number }> = [
    { id: 'generate', label: t('generate'), icon: Sparkles },
    { id: 'track', label: t('trackTab'), icon: Info },
    { id: 'history', label: t('history'), icon: History, badge: historyCount },
  ];
  return (
    <aside className="inspector" aria-label={t('inspector')}>
      <div className="inspector-tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => onTabChange(id)}>
            <Icon size={14} /> {label}
            {badge ? <span className="count">{badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="inspector-body" role="tabpanel">
        {tab === 'generate' && generate}
        {tab === 'track' && track}
        {tab === 'history' && history}
      </div>
    </aside>
  );
}
