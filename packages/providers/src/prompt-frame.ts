import type { EndingMode } from '@loopsmith/core';

/**
 * Direct prompt mode (the default): a short, deterministic English frame built in code, modeled on
 * the pudu-godot sound studio. The frame only fixes the form (game soundtrack, loop or ending,
 * instrumental or not). It names no genre, tempo or key, so the user's own words decide the style.
 * The user's prompt goes last, verbatim, so it has the final word over the project context.
 */

/** Loop length used when the duration field is empty in loop mode. */
export const DEFAULT_LOOP_SECONDS = 16;
/** Longest project context kept in the frame (the frame stays short; the user prompt matters most). */
export const MAX_CONTEXT_CHARS = 400;

export interface PromptFrameInput {
  /** Musical direction: the user prompt verbatim (direct mode) or the refiner output (refine mode). */
  direction: string;
  /** Project context. Collapsed to one line and shortened. Omitted when empty. */
  context?: string;
  /** Gemini description of the base track ("use as base"). */
  referenceDescription?: string;
  durationSeconds?: number;
  vocalsEnabled: boolean;
  ending: EndingMode;
  /** SOUNDTRACK, SFX, VO, AMBIENCE or OTHER (from the output folder). */
  trackType?: string;
}

/** What the frame calls the piece, by track type. */
function pieceNoun(trackType: string | undefined, vocalsEnabled: boolean): string {
  const instrumental = vocalsEnabled ? '' : 'instrumental ';
  switch (trackType) {
    case 'AMBIENCE':
      return `an original ${instrumental}ambient background soundscape for a video game, with little melody`;
    case 'SFX':
      return `an original short ${instrumental}musical sound effect for a video game`;
    case 'VO':
      return 'an original voice-centered piece for a video game';
    default:
      return `an original ${instrumental}soundtrack for a video game`;
  }
}

/** Collapses whitespace and cuts the context at a word boundary. */
export function shortContext(context: string | undefined, max = MAX_CONTEXT_CHARS): string | undefined {
  const flat = context?.replace(/\s+/g, ' ').trim();
  if (!flat) return undefined;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}...`;
}

function sentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Builds the exact text sent to Lyria in direct mode (and around the refiner output in refine mode). */
export function buildFramedPrompt(input: PromptFrameInput): string {
  const seconds = input.durationSeconds && input.durationSeconds > 0 ? Math.round(input.durationSeconds) : undefined;
  const parts: string[] = [`Compose ${pieceNoun(input.trackType, input.vocalsEnabled)}.`];

  if (input.ending === 'loop') {
    parts.push(
      `Make a seamless ${seconds ?? DEFAULT_LOOP_SECONDS}-second loop, with the ending flowing rhythmically and harmonically into the first beat.`,
      'Begin immediately and continue past the loop point.',
      'Avoid an intro, final cadence, fade or silence.'
    );
  } else {
    parts.push(
      seconds
        ? `Make a complete ${seconds}-second piece that begins immediately and reaches a natural final cadence at ${seconds} seconds.`
        : 'Make a complete piece that begins immediately and reaches a natural final cadence.',
      'Avoid a long intro.'
    );
  }
  if (!input.vocalsEnabled) parts.push('No vocals.');

  const context = shortContext(input.context);
  if (context) parts.push(`Context: ${sentence(context)}`);
  if (input.referenceDescription?.trim()) {
    parts.push(`Base track to vary: ${sentence(input.referenceDescription.replace(/\s+/g, ' '))}`);
  }
  parts.push(`Musical direction: ${input.direction.trim()}`);
  return parts.join(' ');
}

/** Default ending for a track type: sound effects and voice pieces end; music and ambience loop. */
export function defaultEndingFor(trackType: string | undefined): EndingMode {
  return trackType === 'SFX' || trackType === 'VO' ? 'ending' : 'loop';
}
