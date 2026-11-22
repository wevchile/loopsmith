import { useTranslation } from 'react-i18next';
import { CircleDashed, Crown, Gamepad2, Replace, Sparkles, Star, XCircle } from 'lucide-react';
import type { AudioTrack, TrackStatus } from '../api';

export const STATUS_ICON = { candidate: CircleDashed, chosen: Star, discarded: XCircle } as const;

export function StatusBadge({ status }: { status: TrackStatus }) {
  const { t } = useTranslation();
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge status-${status}`} title={t(`status_${status}_help`)}>
      <Icon size={11} />
      {t(`status_${status}`)}
    </span>
  );
}

/** "Original" for manifest sounds, "IA" for generated ones. */
export function SourceBadge({ track }: { track: AudioTrack }) {
  const { t } = useTranslation();
  if (track.source === 'manifest') {
    return (
      <span className="badge original" title={t('originalHelp')}>
        <Crown size={11} />
        {t('original')}
      </span>
    );
  }
  if (track.isGenerated) {
    return (
      <span className="badge ai" title={t('aiHelp')}>
        <Sparkles size={11} />
        {t('aiTrack')}
      </span>
    );
  }
  return null;
}

/** Original whose file in the game was replaced by an AI track (can be reverted). */
export function ReplacedBadge({ track }: { track: AudioTrack }) {
  const { t } = useTranslation();
  const latest = track.replacement?.latest;
  return (
    <span className="badge replaced" title={latest ? t('replacedHelp', { backup: latest.backupRelativePath }) : undefined}>
      <Replace size={11} />
      {t('replaced')}
      {track.replacement && track.replacement.active > 1 ? ` x${track.replacement.active}` : ''}
    </span>
  );
}

/** AI track currently written in the game in place of its original. */
export function InGameBadge() {
  const { t } = useTranslation();
  return (
    <span className="badge in-game" title={t('inGameHelp')}>
      <Gamepad2 size={11} />
      {t('inGame')}
    </span>
  );
}
