import type { LyriaModelInfo } from './gemini-lyria.js';

/**
 * Prompt refinement: a Gemini text model rewrites the user's request into a polished Lyria
 * prompt, following the Lyria prompt guide (https://ai.google.dev/gemini-api/docs/lyria-prompt-guide).
 */

/** Stable Flash model that writes the Lyria prompt (newest stable Flash in the Gemini API, Nov 2026). */
export const DEFAULT_REFINE_MODEL = 'gemini-3.8-flash';

export const TRACK_TYPES = ['SOUNDTRACK', 'SFX', 'VO', 'AMBIENCE', 'OTHER'] as const;

export interface RefineInput {
  /** What the user typed. Always has priority over everything else. */
  userPrompt: string;
  projectContext?: string;
  durationSeconds?: number;
  vocalsEnabled: boolean;
  /** Gemini description of the base track when "use as base" is on. */
  referenceDescription?: string;
  /** SOUNDTRACK, SFX, VO, AMBIENCE or OTHER, from the output folder. */
  trackType?: string;
  outputFolder?: string;
  lyriaModel: Pick<LyriaModelInfo, 'id' | 'label' | 'fixedDurationSeconds'>;
}

export const PRIORITY_RULE =
  'PRIORITY RULE: The USER_PROMPT always has the highest priority. If PROJECT_CONTEXT, BASE_TRACK or any other ' +
  'section conflicts with the USER_PROMPT (for example the context says "8-bit" but the user asks for "electronic"), ' +
  'follow the USER_PROMPT and drop the conflicting detail completely; do not blend them. Use the other sections only ' +
  'to fill gaps that the USER_PROMPT leaves open and that do not contradict it.';

export const REFINER_SYSTEM_INSTRUCTION = [
  'You write prompts for Google Lyria, a music generation model, for video game audio.',
  'You receive the request in tagged sections and answer with ONE prompt for Lyria, nothing else.',
  '',
  PRIORITY_RULE,
  'Precedence, highest first: USER_PROMPT > SETTINGS (length, vocals, model) > BASE_TRACK > TRACK_TYPE > PROJECT_CONTEXT.',
  '',
  'How to write the Lyria prompt (from the Lyria prompt guide):',
  '- Write it in English, as one compact paragraph of 60 to 120 words, unless the user asked for lyrics in another language.',
  '- Lead with the primary genre and style (an era or sub-genre if it helps), then instrumentation and how the instruments sound,',
  '  tempo as a number ("128 BPM"), key and scale, mood adjectives, structure and energy over time, and production or mix character.',
  '- Keep every concrete detail the user gave (instruments, tempo, mood, references to places or scenes). Only add details that fit them.',
  '- Game music: make it loop seamlessly (no fade-in, no fade-out, the ending flows back into the start) unless the user asks',
  '  for an intro, an ending or a one-shot sting.',
  '- State the target length in seconds and describe a structure that fits it, with timing markers (for example',
  '  "[0:00 - 0:08] ... [0:08 - 0:16] ..."). For short lengths use one or two sections, no long intro.',
  '- If the model always generates a fixed length, plan the music for exactly that length.',
  '- If vocals are off, end with exactly: "Instrumental only, no vocals, no singing, no spoken words."',
  '- If vocals are on, describe the vocal style and what the lyrics are about, or include the user lyrics under a "Lyrics:" header.',
  '- Track types: SOUNDTRACK = music; AMBIENCE = atmospheric background bed with little melody; SFX = a very short one-shot',
  '  musical sound effect or sting; VO = voice-centered; OTHER = follow the user prompt.',
  '- Never name real artists or copyrighted songs; describe the style instead.',
  '- Output only the prompt text: no title, no quotes, no markdown, no explanations.',
].join('\n');

function section(tag: string, note: string, body: string | undefined): string {
  return `<${tag} ${note}>\n${body?.trim() || '(none)'}\n</${tag}>`;
}

/** Builds the structured request. The USER_PROMPT goes first and is marked as the highest priority. */
export function buildRefinerUserMessage(input: RefineInput): string {
  const length = input.lyriaModel.fixedDurationSeconds
    ? input.durationSeconds && input.durationSeconds < input.lyriaModel.fixedDurationSeconds
      ? `${input.lyriaModel.fixedDurationSeconds} seconds generated (fixed by the model); the first ${Math.round(input.durationSeconds)} seconds will be used, so the main idea must start right away`
      : `${input.lyriaModel.fixedDurationSeconds} seconds (fixed by the model)`
    : input.durationSeconds
      ? `${Math.round(input.durationSeconds)} seconds`
      : 'not specified (choose a length that suits the request)';

  return [
    section('USER_PROMPT', 'priority="highest"', input.userPrompt),
    section(
      'SETTINGS',
      'priority="high"',
      [
        `Lyria model: ${input.lyriaModel.id} (${input.lyriaModel.label})`,
        `Target length: ${length}`,
        `Vocals: ${input.vocalsEnabled ? 'allowed' : 'OFF (instrumental only)'}`,
      ].join('\n')
    ),
    section('BASE_TRACK', 'priority="medium" (create a variation of this track, changed as the USER_PROMPT asks)', input.referenceDescription),
    section(
      'TRACK_TYPE',
      'priority="medium"',
      [input.trackType ?? 'SOUNDTRACK', input.outputFolder ? `(output folder: ${input.outputFolder})` : ''].join(' ').trim()
    ),
    section('PROJECT_CONTEXT', 'priority="lowest" (only fills gaps that do not conflict with USER_PROMPT)', input.projectContext),
    PRIORITY_RULE,
  ].join('\n\n');
}

/** Cleans the model answer: removes code fences, wrapping quotes and a leading "Prompt:" label. */
export function cleanRefinedPrompt(text: string, vocalsEnabled: boolean, instrumentalDirective: string): string {
  let out = text.trim();
  out = out.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
  out = out.replace(/^(lyria\s+)?prompt\s*:\s*/i, '').trim();
  if (/^["'].*["']$/s.test(out)) out = out.slice(1, -1).trim();
  if (!vocalsEnabled && !out.includes(instrumentalDirective)) out = `${out}\n\n${instrumentalDirective}`;
  return out;
}

/** Track type from the first folder segment (SOUNDTRACK/battle -> SOUNDTRACK), when it is one of TRACK_TYPES. */
export function trackTypeFromFolder(folder: string | undefined): string | undefined {
  const first = folder?.replace(/\\/g, '/').split('/').find(Boolean)?.toUpperCase();
  return first && (TRACK_TYPES as readonly string[]).includes(first) ? first : undefined;
}
