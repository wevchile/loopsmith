import { describe, it, expect, vi } from 'vitest';
import {
  GeminiLyriaProvider,
  buildLyriaPrompt,
  parseLyriaInteraction,
  INSTRUMENTAL_DIRECTIVE,
  DEFAULT_LYRIA_MODEL,
  type GenAIClientLike,
} from './gemini-lyria.js';
import { ProviderRegistry } from './provider-registry.js';

function fakeClient(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  const client = {
    interactions: { create },
    models: { generateContent: vi.fn().mockResolvedValue({ text: 'chiptune, 140 BPM' }) },
  } as unknown as GenAIClientLike;
  return { client, create };
}

describe('buildLyriaPrompt', () => {
  it('adds the instrumental directive by default', () => {
    const prompt = buildLyriaPrompt({ prompt: 'Retro boss theme', vocalsEnabled: false });
    expect(prompt).toContain('Retro boss theme');
    expect(prompt).toContain(INSTRUMENTAL_DIRECTIVE);
  });

  it('does not add the instrumental directive when vocals are enabled', () => {
    const prompt = buildLyriaPrompt({ prompt: 'Pop song', vocalsEnabled: true });
    expect(prompt).not.toContain(INSTRUMENTAL_DIRECTIVE);
  });

  it('includes a duration hint', () => {
    expect(buildLyriaPrompt({ prompt: 'x', vocalsEnabled: false, duration: 90 })).toContain('1 minute 30 seconds');
    expect(buildLyriaPrompt({ prompt: 'x', vocalsEnabled: false, duration: 45 })).toContain('45 seconds');
  });
});

describe('parseLyriaInteraction', () => {
  it('reads convenience properties', () => {
    const parsed = parseLyriaInteraction({
      output_audio: { data: Buffer.from('abc').toString('base64'), mime_type: 'audio/mp3' },
      output_text: '[Verse] la la',
    });
    expect(parsed.audio?.toString()).toBe('abc');
    expect(parsed.text).toBe('[Verse] la la');
  });

  it('falls back to iterating steps', () => {
    const parsed = parseLyriaInteraction({
      steps: [
        { type: 'user_input', content: [{ type: 'text', text: 'ignored' }] },
        {
          type: 'model_output',
          content: [
            { type: 'text', text: 'structure' },
            { type: 'audio', data: Buffer.from('xyz').toString('base64'), mime_type: 'audio/wav' },
          ],
        },
      ],
    });
    expect(parsed.audio?.toString()).toBe('xyz');
    expect(parsed.mimeType).toBe('audio/wav');
    expect(parsed.text).toBe('structure');
  });
});

describe('GeminiLyriaProvider', () => {
  it('calls the Interactions API with the configured model and instrumental prompt', async () => {
    const { client, create } = fakeClient({
      output_audio: { data: Buffer.from('mp3data').toString('base64'), mime_type: 'audio/mp3' },
    });
    const provider = new GeminiLyriaProvider({}, client);
    const result = await provider.generate({ prompt: '8-bit overworld', vocalsEnabled: false });

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(DEFAULT_LYRIA_MODEL);
    expect(params.input).toContain(INSTRUMENTAL_DIRECTIVE);
    expect(params.response_format).toBeUndefined();
    expect(result.format).toBe('mp3');
    expect(result.audioData.toString()).toBe('mp3data');
  });

  it('honours a custom model id and wav output', async () => {
    const { client, create } = fakeClient({
      output_audio: { data: Buffer.from('wav').toString('base64'), mime_type: 'audio/wav' },
    });
    const provider = new GeminiLyriaProvider({ lyriaModel: 'lyria-3-clip-preview', outputFormat: 'wav' }, client);
    const result = await provider.generate({ prompt: 'x', vocalsEnabled: true });
    expect(create.mock.calls[0][0].model).toBe('lyria-3-clip-preview');
    expect(create.mock.calls[0][0].response_format).toEqual({ type: 'audio', mime_type: 'audio/wav' });
    expect(result.format).toBe('wav');
  });

  it('throws a clear error when no audio is returned', async () => {
    const { client } = fakeClient({ output_text: 'blocked' });
    const provider = new GeminiLyriaProvider({}, client);
    await expect(provider.generate({ prompt: 'x', vocalsEnabled: false })).rejects.toThrow(/no audio/);
  });

  it('requires an API key when no client is injected', () => {
    expect(() => new GeminiLyriaProvider({})).toThrow(/GEMINI_API_KEY/);
  });
});

describe('ProviderRegistry', () => {
  it('registers no provider without an API key', () => {
    expect(ProviderRegistry.createDefault({}).listProviders()).toHaveLength(0);
  });

  it('registers Lyria when an API key is present', () => {
    const registry = ProviderRegistry.createDefault({ apiKey: 'test-key' });
    expect(registry.getProvider('gemini-lyria')?.model).toBe(DEFAULT_LYRIA_MODEL);
  });
});
