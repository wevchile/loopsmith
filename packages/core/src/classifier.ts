import type { SoundType } from './types.js';

const SOUNDTRACK_KEYWORDS = new Set(['music', 'bgm', 'ost', 'soundtrack', 'theme', 'song', 'score', 'track', 'battle', 'boss', 'menu', 'title', 'credits']);
const SFX_KEYWORDS = new Set(['sfx', 'se', 'fx', 'sound', 'effect', 'ui', 'click', 'hit', 'jump', 'footstep', 'step', 'explosion', 'shot', 'impact', 'pickup', 'coin', 'hurt', 'door', 'weapon']);
const VO_KEYWORDS = new Set(['vo', 'vox', 'voice', 'dialog', 'dialogue', 'speech', 'narration', 'narrator', 'talk', 'line', 'bark']);
const AMBIENCE_KEYWORDS = new Set(['amb', 'ambience', 'ambient', 'atmos', 'atmosphere', 'env', 'environment', 'wind', 'rain', 'forest', 'cave', 'city', 'crowd', 'water']);

const SOUNDTRACK_DURATION_MIN = 30;
const SFX_DURATION_MAX = 5;
const VO_DURATION_RANGE = [1, 30] as const;

/**
 * Splits a path into lowercase word tokens: "music/BossTheme_01.ogg" -> ["music", "boss", "theme", "01", "ogg"].
 * Plural forms ("sounds", "effects") are also added in singular form.
 */
export function tokenizePath(input: string): string[] {
  const words = input
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const tokens = new Set<string>();
  for (const word of words) {
    tokens.add(word);
    if (word.length > 3 && word.endsWith('s')) tokens.add(word.slice(0, -1));
  }
  return [...tokens];
}

/**
 * Classifies an audio file using its folder path and name first (whole-word keyword matching,
 * so "guitar" does not match "ui"), then its duration, then loop markers. Falls back to OTHER.
 */
export function classifyAudioFile(
  fileName: string,
  folderPath: string,
  duration?: number,
  hasLoopMarkers?: boolean
): SoundType {
  const tokens = tokenizePath(`${folderPath}/${fileName}`);
  const has = (set: Set<string>) => tokens.some((token) => set.has(token));

  // Same order as docs/MANIFEST_GENERATOR_PROMPT.md: voices first (a "battle" voice line is still VO),
  // then music, then ambience, then short effects.
  if (has(VO_KEYWORDS)) return 'VO';
  if (has(SOUNDTRACK_KEYWORDS)) return 'SOUNDTRACK';
  if (has(AMBIENCE_KEYWORDS)) return 'AMBIENCE';
  if (has(SFX_KEYWORDS)) return 'SFX';

  if (duration !== undefined) {
    if (duration >= SOUNDTRACK_DURATION_MIN) return 'SOUNDTRACK';
    if (duration <= SFX_DURATION_MAX) return 'SFX';
    if (duration >= VO_DURATION_RANGE[0] && duration <= VO_DURATION_RANGE[1]) return 'VO';
  }

  if (hasLoopMarkers) return 'SOUNDTRACK';

  return 'OTHER';
}
