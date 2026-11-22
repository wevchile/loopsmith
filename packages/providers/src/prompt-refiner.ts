/**
 * Optional "Pulir con IA" step (LOOPSMITH_PROMPT_MODE=refine or the switch in the UI).
 * A Gemini text model rewrites only the MUSICAL DIRECTION, lightly. Loopsmith then wraps that
 * text in the same deterministic frame as direct mode (see prompt-frame.ts), so the loop or
 * ending wording, the length and the vocals instruction always come from code, not from the model.
 */

/** Stable Flash model that writes the musical direction (newest stable Flash in the Gemini API, Nov 2026). */
export const DEFAULT_REFINE_MODEL = 'gemini-3.8-flash';
/** Low temperature: the same request should give nearly the same direction. */
export const REFINE_TEMPERATURE = 0.25;

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
}

export const PRIORITY_RULE =
  'PRIORITY RULE: The USER_PROMPT always has the highest priority. If PROJECT_CONTEXT or BASE_TRACK conflicts with ' +
  'the USER_PROMPT (for example the context says "8-bit" but the user asks for "electronic"), follow the USER_PROMPT ' +
  'and drop the conflicting detail completely; do not blend them. Use the other sections only to fill gaps that the ' +
  'USER_PROMPT leaves open and that do not contradict it.';

export const REFINER_SYSTEM_INSTRUCTION = [
  'You lightly polish the musical direction of a request for Google Lyria, a music generation model, for video game audio.',
  'You receive the request in tagged sections and answer with ONE short musical direction, nothing else.',
  '',
  PRIORITY_RULE,
  '',
  'Rules:',
  '- Stay close to the user\'s own words. Keep every concrete detail they gave: instruments, rhythms, genres, moods,',
  '  places, regional or cultural references, and any named songs, composers or pieces exactly as written.',
  '- Do not invent a tempo (BPM), key, scale, time signature, section plan or timing markers. Mention them only if the user gave them.',
  '- You may add a few words of instrumentation or mood that clearly fit the request and the context.',
  '- Write in English (translate faithfully, keep names and cultural terms as written), 40 to 70 words, one paragraph.',
  '- Do not mention the length, looping, endings, fades or vocals: the app adds that wording itself.',
  '- Output only the direction text: no title, no quotes, no markdown, no explanations.',
].join('\n');

function section(tag: string, note: string, body: string | undefined): string {
  return `<${tag} ${note}>\n${body?.trim() || '(none)'}\n</${tag}>`;
}

/** Builds the structured request. The USER_PROMPT goes first and is marked as the highest priority. */
export function buildRefinerUserMessage(input: RefineInput): string {
  return [
    section('USER_PROMPT', 'priority="highest"', input.userPrompt),
    section('BASE_TRACK', 'priority="medium" (vary this track as the USER_PROMPT asks)', input.referenceDescription),
    section('TRACK_TYPE', 'priority="medium"', input.trackType ?? 'SOUNDTRACK'),
    section('PROJECT_CONTEXT', 'priority="lowest" (only fills gaps that do not conflict with USER_PROMPT)', input.projectContext),
    PRIORITY_RULE,
  ].join('\n\n');
}

/** Cleans the model answer: removes code fences, wrapping quotes and a leading label, joins lines. */
export function cleanRefinedPrompt(text: string): string {
  let out = text.trim();
  out = out.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
  out = out.replace(/^((lyria\s+)?prompt|(musical\s+)?direction)\s*:\s*/i, '').trim();
  if (/^["'].*["']$/s.test(out)) out = out.slice(1, -1).trim();
  return out.replace(/\s*\n+\s*/g, ' ').trim();
}

/** Track type from the first folder segment (SOUNDTRACK/battle -> SOUNDTRACK), when it is one of TRACK_TYPES. */
export function trackTypeFromFolder(folder: string | undefined): string | undefined {
  const first = folder?.replace(/\\/g, '/').split('/').find(Boolean)?.toUpperCase();
  return first && (TRACK_TYPES as readonly string[]).includes(first) ? first : undefined;
}
