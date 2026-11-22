import type { SoundType } from './types.js';

const SOUNDTRACK_KEYWORDS = ['music', 'bgm', 'ost', 'soundtrack', 'theme', 'track', 'song'];
const SFX_KEYWORDS = ['sfx', 'sound', 'effect', 'hit', 'ui', 'click', 'explosion', 'jump', 'footstep'];
const VO_KEYWORDS = ['vo', 'voice', 'dialog', 'dialogue', 'speech', 'narration', 'talk'];
const AMBIENCE_KEYWORDS = ['amb', 'ambience', 'ambient', 'env', 'environment', 'atmosphere', 'wind', 'rain'];

const SOUNDTRACK_DURATION_MIN = 30;
const SFX_DURATION_MAX = 5;
const VO_DURATION_RANGE = [1, 30] as const;

export function classifyAudioFile(
  fileName: string,
  folderPath: string,
  duration?: number,
  hasLoopMarkers?: boolean
): SoundType {
  const lowerName = fileName.toLowerCase();
  const lowerPath = folderPath.toLowerCase();
  const combined = `${lowerPath}/${lowerName}`;

  if (SOUNDTRACK_KEYWORDS.some(kw => combined.includes(kw))) {
    return 'SOUNDTRACK';
  }

  if (SFX_KEYWORDS.some(kw => combined.includes(kw))) {
    return 'SFX';
  }

  if (VO_KEYWORDS.some(kw => combined.includes(kw))) {
    return 'VO';
  }

  if (AMBIENCE_KEYWORDS.some(kw => combined.includes(kw))) {
    return 'AMBIENCE';
  }

  if (duration !== undefined) {
    if (duration >= SOUNDTRACK_DURATION_MIN) {
      return 'SOUNDTRACK';
    }

    if (duration <= SFX_DURATION_MAX) {
      return 'SFX';
    }

    if (duration >= VO_DURATION_RANGE[0] && duration <= VO_DURATION_RANGE[1]) {
      return 'VO';
    }
  }

  if (hasLoopMarkers) {
    return 'SOUNDTRACK';
  }

  return 'OTHER';
}
