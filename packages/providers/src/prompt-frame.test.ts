import { describe, it, expect } from 'vitest';
import { DEFAULT_LOOP_SECONDS, buildFramedPrompt, defaultEndingFor, shortContext } from './prompt-frame.js';

const base = { direction: 'Utiliza el ritmo de vals en tonalidad mayor', vocalsEnabled: false, ending: 'loop' as const };

describe('buildFramedPrompt (direct mode)', () => {
  it('builds the pudu-style loop frame with the user prompt verbatim and last', () => {
    const p = buildFramedPrompt({ ...base, durationSeconds: 16, context: 'Costa de Chiloé, Chile. Redes fantasma' });
    expect(p).toBe(
      'Compose an original instrumental soundtrack for a video game. ' +
        'Make a seamless 16-second loop, with the ending flowing rhythmically and harmonically into the first beat. ' +
        'Begin immediately and continue past the loop point. Avoid an intro, final cadence, fade or silence. No vocals. ' +
        'Context: Costa de Chiloé, Chile. Redes fantasma. ' +
        'Musical direction: Utiliza el ritmo de vals en tonalidad mayor'
    );
    expect(p.endsWith(base.direction)).toBe(true);
  });

  it('uses the default loop length and skips an empty context', () => {
    const p = buildFramedPrompt({ ...base, context: '   ' });
    expect(p).toContain(`seamless ${DEFAULT_LOOP_SECONDS}-second loop`);
    expect(p).not.toContain('Context:');
  });

  it('drops the instrumental wording when vocals are on', () => {
    const p = buildFramedPrompt({ ...base, vocalsEnabled: true, durationSeconds: 20 });
    expect(p).toMatch(/^Compose an original soundtrack for a video game\./);
    expect(p).not.toMatch(/instrumental|No vocals/i);
  });

  it('swaps the loop wording for a natural ending ("Con final")', () => {
    const p = buildFramedPrompt({ ...base, ending: 'ending', durationSeconds: 12 });
    expect(p).toContain('Make a complete 12-second piece that begins immediately and reaches a natural final cadence at 12 seconds.');
    expect(p).not.toMatch(/loop/i);
    expect(buildFramedPrompt({ ...base, ending: 'ending' })).toContain('reaches a natural final cadence.');
  });

  it('adapts the piece to the track type and adds the base track before the direction', () => {
    expect(buildFramedPrompt({ ...base, trackType: 'AMBIENCE' })).toContain('ambient background soundscape');
    expect(buildFramedPrompt({ ...base, trackType: 'SFX', ending: 'ending' })).toContain('short instrumental musical sound effect');
    const p = buildFramedPrompt({ ...base, referenceDescription: 'slow harp\nin A minor' });
    expect(p).toContain('Base track to vary: slow harp in A minor. Musical direction:');
  });

  it('keeps the context short', () => {
    const long = 'word '.repeat(200);
    const c = shortContext(long)!;
    expect(c.length).toBeLessThanOrEqual(403);
    expect(c.endsWith('...')).toBe(true);
  });

  it('defaults to an ending for sound effects and voice, and to a loop otherwise', () => {
    expect(defaultEndingFor('SFX')).toBe('ending');
    expect(defaultEndingFor('VO')).toBe('ending');
    expect(defaultEndingFor('SOUNDTRACK')).toBe('loop');
    expect(defaultEndingFor(undefined)).toBe('loop');
  });
});
