import { describe, it, expect, vi } from 'vitest';
import {
  PRIORITY_RULE,
  REFINER_SYSTEM_INSTRUCTION,
  REFINE_TEMPERATURE,
  DEFAULT_REFINE_MODEL,
  buildRefinerUserMessage,
  cleanRefinedPrompt,
  trackTypeFromFolder,
} from './prompt-refiner.js';
import { GeminiLyriaProvider, type GenAIClientLike } from './gemini-lyria.js';

describe('buildRefinerUserMessage', () => {
  const message = buildRefinerUserMessage({
    userPrompt: 'musica electronica para nivel de discoteca',
    projectContext: '8-bit retro',
    durationSeconds: 16,
    vocalsEnabled: false,
    trackType: 'SOUNDTRACK',
    outputFolder: 'SOUNDTRACK',
  });

  it('puts the user prompt first, marked as the highest priority, and the context last', () => {
    expect(message.startsWith('<USER_PROMPT priority="highest">\nmusica electronica')).toBe(true);
    expect(message.indexOf('<USER_PROMPT')).toBeLessThan(message.indexOf('<PROJECT_CONTEXT'));
    expect(message).toMatch(/<PROJECT_CONTEXT priority="lowest"[^>]*>\n8-bit retro\n<\/PROJECT_CONTEXT>/);
    expect(message).toContain(PRIORITY_RULE);
  });

  it('leaves length, loop and vocals out (the frame adds them in code)', () => {
    expect(message).not.toMatch(/Target length|Vocals:|Lyria model/);
  });

  it('includes the base track description', () => {
    const m = buildRefinerUserMessage({ userPrompt: 'faster', vocalsEnabled: false, referenceDescription: 'slow piano' });
    expect(m).toMatch(/<BASE_TRACK[^>]*>\nslow piano/);
  });
});

describe('light refiner instruction', () => {
  it('keeps the user words and references and invents no tempo, key or timing markers', () => {
    expect(REFINER_SYSTEM_INSTRUCTION).toContain(PRIORITY_RULE);
    expect(REFINER_SYSTEM_INSTRUCTION).toMatch(/named songs, composers or pieces exactly as written/);
    expect(REFINER_SYSTEM_INSTRUCTION).toMatch(/Do not invent a tempo \(BPM\), key/);
    expect(REFINER_SYSTEM_INSTRUCTION).toMatch(/40 to 70 words/);
    expect(REFINER_SYSTEM_INSTRUCTION).not.toMatch(/Never name real artists/);
    expect(REFINE_TEMPERATURE).toBeLessThanOrEqual(0.3);
  });
});

describe('cleanRefinedPrompt', () => {
  it('strips fences, labels and quotes and joins lines', () => {
    expect(cleanRefinedPrompt('```\nPrompt: "Chilote waltz with accordion"\n```')).toBe('Chilote waltz with accordion');
    expect(cleanRefinedPrompt('Musical direction: Harp\nand piano')).toBe('Harp and piano');
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

  it('sends the light instruction at a low temperature and returns only the direction', async () => {
    const { c, generateContent } = client('Chilote waltz in a major key with violin, accordion, guitar and a drum.');
    const provider = new GeminiLyriaProvider({}, c);
    const result = await provider.refinePrompt({
      userPrompt: 'vals en tonalidad mayor con violin y acordeon',
      projectContext: 'Costa de Chiloe',
      vocalsEnabled: false,
    });
    const params = generateContent.mock.calls[0][0];
    expect(params.model).toBe(DEFAULT_REFINE_MODEL);
    expect(params.config).toMatchObject({ systemInstruction: REFINER_SYSTEM_INSTRUCTION, temperature: REFINE_TEMPERATURE });
    expect(params.contents[0].parts[0].text).toContain('Costa de Chiloe');
    expect(result).toEqual({ prompt: 'Chilote waltz in a major key with violin, accordion, guitar and a drum.', model: DEFAULT_REFINE_MODEL });
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
    await provider.generate({ prompt: 'Framed text', promptIsFinal: true, vocalsEnabled: false, duration: 16 });
    expect(create.mock.calls[0][0].input).toBe('Framed text');
  });
});
