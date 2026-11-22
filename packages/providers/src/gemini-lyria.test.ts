import { describe, it, expect, vi } from 'vitest';
import {
  GeminiLyriaProvider,
  buildLyriaPrompt,
  parseLyriaInteraction,
  INSTRUMENTAL_DIRECTIVE,
  DEFAULT_LYRIA_MODEL,
  LYRIA_MODELS,
  getLyriaModelInfo,
  splitLyriaText,
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

  it('includes a duration hint with a timestamped structure', () => {
    expect(buildLyriaPrompt({ prompt: 'x', vocalsEnabled: false, duration: 90 })).toContain('1 minute 30 seconds');
    const prompt = buildLyriaPrompt({ prompt: 'x', vocalsEnabled: false, duration: 16 });
    expect(prompt).toContain('16 seconds');
    expect(prompt).toContain('[0:00 - 0:16]');
  });
});

describe('splitLyriaText', () => {
  it('treats section markers as structure, not lyrics', () => {
    expect(splitLyriaText('[[A0]]\n[[B1]]\n[[C2]]')).toEqual({ structure: '[[A0]]\n[[B1]]\n[[C2]]' });
  });

  it('treats the clip model "<instrumental>" tag as structure', () => {
    expect(splitLyriaText('<instrumental>')).toEqual({ structure: '<instrumental>' });
  });

  it('keeps real lyrics without the marker lines', () => {
    const split = splitLyriaText('[[A0]]\nHello night\n[[B1]]\nWe run');
    expect(split.lyrics).toBe('Hello night\nWe run');
    expect(split.structure).toContain('[[A0]]');
  });

  it('treats a JSON description as structure', () => {
    expect(splitLyriaText('{"sections":[]}')).toEqual({ structure: '{"sections":[]}' });
  });
});

describe('model catalog', () => {
  it('lists every Lyria model with lyria-3.5 as the stable default', () => {
    expect(LYRIA_MODELS.map((m) => m.id)).toEqual(['lyria-3.5', 'lyria-3-clip-preview', 'lyria-3-pro-preview', 'lyria-realtime-exp']);
    expect(getLyriaModelInfo(DEFAULT_LYRIA_MODEL).status).toBe('stable');
    expect(getLyriaModelInfo('something-new').status).toBe('unknown');
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

  it('requests wav from lyria-3.5', async () => {
    const { client, create } = fakeClient({
      output_audio: { data: Buffer.from('wav').toString('base64'), mime_type: 'audio/wav' },
    });
    const provider = new GeminiLyriaProvider({ lyriaModel: 'lyria-3.5', outputFormat: 'wav' }, client);
    const result = await provider.generate({ prompt: 'x', vocalsEnabled: true });
    expect(create.mock.calls[0][0].response_format).toEqual({ type: 'audio', mime_type: 'audio/wav' });
    expect(result.format).toBe('wav');
  });

  it('uses the clip model as a fixed 30 s mp3 model', async () => {
    const { client, create } = fakeClient({
      output_audio: { data: Buffer.from('mp3').toString('base64'), mime_type: 'audio/mp3' },
      output_text: '[[A0]]\n[[B1]]',
    });
    const provider = new GeminiLyriaProvider({ lyriaModel: 'lyria-3-clip-preview', outputFormat: 'wav' }, client);
    expect(provider.capabilities.fixedDurationSeconds).toBe(30);
    expect(provider.capabilities.maxDurationSeconds).toBe(30);
    const result = await provider.generate({ prompt: 'x', vocalsEnabled: false, duration: 16 });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('lyria-3-clip-preview');
    expect(params.response_format).toBeUndefined();
    expect(params.input).not.toContain('16 seconds');
    expect(result.format).toBe('mp3');
    expect(result.lyrics).toBeUndefined();
    expect(result.structure).toBe('[[A0]]\n[[B1]]');
  });

  it('accepts the previous generation and unknown model ids through the Interactions API', async () => {
    for (const model of ['lyria-3-pro-preview', 'lyria-9-future']) {
      const { client, create } = fakeClient({ output_audio: { data: 'AA==', mime_type: 'audio/mp3' } });
      await new GeminiLyriaProvider({ lyriaModel: model }, client).generate({ prompt: 'x', vocalsEnabled: false });
      expect(create.mock.calls[0][0].model).toBe(model);
    }
  });

  it('rejects the realtime streaming model with a clear message', () => {
    const { client } = fakeClient({});
    expect(() => new GeminiLyriaProvider({ lyriaModel: 'lyria-realtime-exp' }, client)).toThrow(/real-time streaming/);
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

describe('API version', () => {
  it('defaults to v1beta because Lyria is not served on v1', async () => {
    const { DEFAULT_API_VERSION } = await import('./gemini-lyria.js');
    expect(DEFAULT_API_VERSION).toBe('v1beta');
  });
});
