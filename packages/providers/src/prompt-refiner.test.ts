import { describe, it, expect, vi } from 'vitest';
import {
  PRIORITY_RULE,
  REFINER_SYSTEM_INSTRUCTION,
  DEFAULT_REFINE_MODEL,
  buildRefinerUserMessage,
  cleanRefinedPrompt,
  trackTypeFromFolder,
} from './prompt-refiner.js';
import { GeminiLyriaProvider, INSTRUMENTAL_DIRECTIVE, type GenAIClientLike } from './gemini-lyria.js';

const clip = { id: 'lyria-3-clip-preview', label: 'Lyria 3 Clip (preview)', fixedDurationSeconds: 30 };
const full = { id: 'lyria-3.5', label: 'Lyria 3.5' };

describe('buildRefinerUserMessage', () => {
  const message = buildRefinerUserMessage({
    userPrompt: 'musica electronica para nivel de discoteca, 16 segundos',
    projectContext: '8-bit retro',
    durationSeconds: 16,
    vocalsEnabled: false,
    trackType: 'SOUNDTRACK',
    outputFolder: 'SOUNDTRACK',
    lyriaModel: full,
  });

  it('puts the user prompt first, marked as the highest priority, and the context last', () => {
    expect(message.startsWith('<USER_PROMPT priority="highest">\nmusica electronica')).toBe(true);
    expect(message.indexOf('<USER_PROMPT')).toBeLessThan(message.indexOf('<PROJECT_CONTEXT'));
    expect(message).toMatch(/<PROJECT_CONTEXT priority="lowest"[^>]*>\n8-bit retro\n<\/PROJECT_CONTEXT>/);
  });

  it('repeats the priority rule and includes all settings', () => {
    expect(message).toContain(PRIORITY_RULE);
    expect(message).toContain('Target length: 16 seconds');
    expect(message).toContain('Vocals: OFF (instrumental only)');
    expect(message).toContain('Lyria model: lyria-3.5');
    expect(message).toContain('<BASE_TRACK');
    expect(message).toContain('(none)');
  });

  it('explains the fixed 30 s length of the clip model', () => {
    const m = buildRefinerUserMessage({ userPrompt: 'x', vocalsEnabled: true, durationSeconds: 16, lyriaModel: clip });
    expect(m).toContain('30 seconds generated (fixed by the model); the first 16 seconds will be used');
    expect(m).toContain('Vocals: allowed');
  });

  it('includes the base track description', () => {
    const m = buildRefinerUserMessage({ userPrompt: 'faster', vocalsEnabled: false, referenceDescription: 'slow piano', lyriaModel: full });
    expect(m).toMatch(/<BASE_TRACK[^>]*>\nslow piano/);
  });
});

describe('system instruction', () => {
  it('states that the user prompt wins over the project context', () => {
    expect(REFINER_SYSTEM_INSTRUCTION).toContain(PRIORITY_RULE);
    expect(PRIORITY_RULE).toMatch(/USER_PROMPT always has the highest priority/);
    expect(REFINER_SYSTEM_INSTRUCTION).toContain('USER_PROMPT > SETTINGS');
    expect(REFINER_SYSTEM_INSTRUCTION).toMatch(/BPM/);
    expect(REFINER_SYSTEM_INSTRUCTION).toMatch(/loop seamlessly/);
  });
});

describe('cleanRefinedPrompt', () => {
  it('strips fences, labels and quotes and enforces the instrumental instruction', () => {
    expect(cleanRefinedPrompt('```\nPrompt: "Techno at 128 BPM"\n```', false, INSTRUMENTAL_DIRECTIVE)).toBe(
      `Techno at 128 BPM\n\n${INSTRUMENTAL_DIRECTIVE}`
    );
    expect(cleanRefinedPrompt(`House. ${INSTRUMENTAL_DIRECTIVE}`, false, INSTRUMENTAL_DIRECTIVE)).toBe(`House. ${INSTRUMENTAL_DIRECTIVE}`);
    expect(cleanRefinedPrompt('Pop song', true, INSTRUMENTAL_DIRECTIVE)).toBe('Pop song');
  });
});

describe('trackTypeFromFolder', () => {
  it('reads the type from the first folder segment', () => {
    expect(trackTypeFromFolder('SOUNDTRACK/battle')).toBe('SOUNDTRACK');
    expect(trackTypeFromFolder('ambience')).toBe('AMBIENCE');
    expect(trackTypeFromFolder('music')).toBeUndefined();
  });
});

describe('GeminiLyriaProvider.refinePrompt', () => {
  function client(text: string | Error) {
    const generateContent = text instanceof Error ? vi.fn().mockRejectedValue(text) : vi.fn().mockResolvedValue({ text });
    const create = vi.fn().mockResolvedValue({ output_audio: { data: 'AA==', mime_type: 'audio/mp3' } });
    return { c: { interactions: { create }, models: { generateContent } } as unknown as GenAIClientLike, generateContent, create };
  }

  it('sends the system instruction with the priority rule and the structured sections', async () => {
    const { c, generateContent } = client('Electronic house track, 126 BPM, four-on-the-floor kick.');
    const provider = new GeminiLyriaProvider({ lyriaModel: 'lyria-3-clip-preview' }, c);
    const result = await provider.refinePrompt({
      userPrompt: 'musica electronica para nivel de discoteca',
      projectContext: '8-bit retro',
      durationSeconds: 16,
      vocalsEnabled: false,
    });
    const params = generateContent.mock.calls[0][0];
    expect(params.model).toBe(DEFAULT_REFINE_MODEL);
    expect(params.config.systemInstruction).toContain(PRIORITY_RULE);
    const text = params.contents[0].parts[0].text as string;
    expect(text).toContain('<USER_PROMPT priority="highest">');
    expect(text).toContain('8-bit retro');
    expect(text).toContain(PRIORITY_RULE);
    expect(text).toContain('lyria-3-clip-preview');
    expect(result.model).toBe(DEFAULT_REFINE_MODEL);
    expect(result.prompt).toContain('126 BPM');
    expect(result.prompt).toContain(INSTRUMENTAL_DIRECTIVE);
  });

  it('uses the configured refine model and propagates errors', async () => {
    const { c, generateContent } = client(new Error('quota'));
    const provider = new GeminiLyriaProvider({ refineModel: 'gemini-3.6-flash' }, c);
    await expect(provider.refinePrompt({ userPrompt: 'x', vocalsEnabled: false })).rejects.toThrow('quota');
    expect(generateContent.mock.calls[0][0].model).toBe('gemini-3.6-flash');
  });

  it('sends a final prompt to Lyria as is', async () => {
    const { c, create } = client('');
    const provider = new GeminiLyriaProvider({}, c);
    await provider.generate({ prompt: 'Refined text', promptIsFinal: true, vocalsEnabled: false, duration: 16 });
    expect(create.mock.calls[0][0].input).toBe('Refined text');
  });
});
