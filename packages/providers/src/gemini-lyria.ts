import { GoogleGenAI } from '@google/genai';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { GenerateRequest, GenerateResult, ProviderCapabilities } from '@loopsmith/core';
import type { MusicProvider, ProviderConfig } from './provider.js';

/**
 * Stable Lyria model for full-length tracks.
 * See https://ai.google.dev/gemini-api/docs/music-generation and https://ai.google.dev/gemini-api/docs/models
 */
export const DEFAULT_LYRIA_MODEL = 'lyria-3.5';
/**
 * Gemini API version. Lyria models are only served on v1beta (on v1 the API answers
 * "404 Model 'lyria-3.5' not found"), while @google/genai defaults to v1.
 */
export const DEFAULT_API_VERSION = 'v1beta';
/** Stable Gemini model used to listen to a reference track and describe it. */
export const DEFAULT_ANALYSIS_MODEL = 'gemini-3.6-flash';

export const INSTRUMENTAL_DIRECTIVE = 'Instrumental only, no vocals, no singing, no spoken words.';

/** Minimal shape of an Interactions API content block that we read. */
interface InteractionContentBlock {
  type: string;
  data?: string;
  mime_type?: string;
  text?: string;
}

/** Minimal shape of an Interactions API response that we read. */
export interface LyriaInteraction {
  output_audio?: { data?: string; mime_type?: string } | undefined;
  output_text?: string | undefined;
  steps?: Array<{ type: string; content?: InteractionContentBlock[] }> | undefined;
}

export interface LyriaInteractionParams {
  model: string;
  input: string;
  response_format?: { type: 'audio'; mime_type?: string };
}

/** The subset of the @google/genai client used by this provider (injectable for tests). */
export interface GenAIClientLike {
  interactions: {
    create(params: LyriaInteractionParams): Promise<LyriaInteraction>;
  };
  models: {
    generateContent(params: {
      model: string;
      contents: Array<{ role: string; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> }>;
    }): Promise<{ text?: string | undefined }>;
  };
}

/** Wraps the real @google/genai client so every call below is type-checked against the SDK. */
export function createGenAIClient(apiKey: string, apiVersion: string = DEFAULT_API_VERSION): GenAIClientLike {
  const ai = new GoogleGenAI({ apiKey, apiVersion });
  return {
    interactions: {
      async create(params) {
        const interaction = await ai.interactions.create({
          model: params.model,
          input: params.input,
          ...(params.response_format ? { response_format: params.response_format } : {}),
        });
        return interaction as LyriaInteraction;
      },
    },
    models: {
      generateContent: (params) => ai.models.generateContent(params),
    },
  };
}

/**
 * Builds the final prompt sent to Lyria. Instrumental is the default: unless vocals are
 * explicitly enabled, an explicit "no vocals" directive is always appended.
 */
export function buildLyriaPrompt(request: Pick<GenerateRequest, 'prompt' | 'vocalsEnabled' | 'duration'>): string {
  const parts: string[] = [];

  if (request.duration && request.duration > 0) {
    const total = Math.round(request.duration);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    const label =
      minutes > 0
        ? `${minutes} minute${minutes > 1 ? 's' : ''}${seconds > 0 ? ` ${seconds} second${seconds > 1 ? 's' : ''}` : ''}`
        : `${seconds} second${seconds > 1 ? 's' : ''}`;
    parts.push(`Create a track of about ${label}.`);
  }

  parts.push(request.prompt.trim());

  if (request.vocalsEnabled) {
    parts.push('Vocals are allowed.');
  } else {
    parts.push(INSTRUMENTAL_DIRECTIVE);
  }

  return parts.join('\n\n');
}

/** Extracts audio bytes and lyrics/structure text from a Lyria interaction. */
export function parseLyriaInteraction(interaction: LyriaInteraction): {
  audio: Buffer | null;
  mimeType?: string;
  text?: string;
} {
  let audioB64 = interaction.output_audio?.data;
  let mimeType = interaction.output_audio?.mime_type;
  const texts: string[] = [];

  for (const step of interaction.steps ?? []) {
    if (step.type !== 'model_output') continue;
    for (const block of step.content ?? []) {
      if (block.type === 'audio' && block.data && !audioB64) {
        audioB64 = block.data;
        mimeType = block.mime_type;
      } else if (block.type === 'text' && block.text) {
        texts.push(block.text);
      }
    }
  }

  const text = interaction.output_text || (texts.length > 0 ? texts.join('\n') : undefined);

  return {
    audio: audioB64 ? Buffer.from(audioB64, 'base64') : null,
    mimeType,
    text,
  };
}

function formatFromMime(mimeType: string | undefined, fallback: 'mp3' | 'wav'): string {
  if (!mimeType) return fallback;
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'ogg';
  if (mimeType.includes('flac')) return 'flac';
  return fallback;
}

export function audioMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.m4a':
      return 'audio/mp4';
    case '.flac':
      return 'audio/flac';
    default:
      return 'application/octet-stream';
  }
}

/** Gemini analysis accepts inline audio up to roughly 20 MB per request. */
const MAX_INLINE_REFERENCE_BYTES = 18 * 1024 * 1024;

export class GeminiLyriaProvider implements MusicProvider {
  readonly id = 'gemini-lyria';
  readonly name: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities = {
    supportsInstrumental: true,
    supportsVocals: true,
    supportsReferenceAudio: false,
    maxDurationSeconds: 240,
    outputFormats: ['mp3', 'wav'],
  };

  private readonly client: GenAIClientLike;
  private readonly analysisModel: string;
  private readonly outputFormat: 'mp3' | 'wav';

  constructor(config: ProviderConfig, client?: GenAIClientLike) {
    if (!config.apiKey && !client) {
      throw new Error('GEMINI_API_KEY is required for the Gemini Lyria provider');
    }
    this.model = config.lyriaModel || DEFAULT_LYRIA_MODEL;
    this.name = `Google Lyria (${this.model})`;
    this.analysisModel = config.analysisModel || DEFAULT_ANALYSIS_MODEL;
    this.outputFormat = config.outputFormat === 'wav' ? 'wav' : 'mp3';
    this.client = client ?? createGenAIClient(config.apiKey as string, config.apiVersion || DEFAULT_API_VERSION);
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const prompt = buildLyriaPrompt(request);
    const format = request.outputFormat ?? this.outputFormat;

    const params: LyriaInteractionParams = { model: this.model, input: prompt };
    if (format === 'wav') {
      params.response_format = { type: 'audio', mime_type: 'audio/wav' };
    }

    let interaction: LyriaInteraction;
    try {
      interaction = await this.client.interactions.create(params);
    } catch (error) {
      throw new Error(`Lyria generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const parsed = parseLyriaInteraction(interaction);
    if (!parsed.audio || parsed.audio.length === 0) {
      throw new Error(
        `Lyria returned no audio${parsed.text ? `: ${parsed.text.slice(0, 300)}` : ''}. The prompt may have been blocked by safety filters.`
      );
    }

    return {
      audioData: parsed.audio,
      format: formatFromMime(parsed.mimeType, format),
      lyrics: parsed.text,
      metadata: {
        model: this.model,
        prompt,
        vocalsEnabled: request.vocalsEnabled,
        mimeType: parsed.mimeType,
      },
    };
  }

  async analyzeReference(audioPath: string): Promise<string> {
    const audioBuffer = await readFile(audioPath);
    if (audioBuffer.length > MAX_INLINE_REFERENCE_BYTES) {
      throw new Error('Reference track is too large to analyze (limit is about 18 MB)');
    }

    const instruction = [
      'Listen to this audio and describe it so a music generation model can create a close variation of it.',
      'Include: genre and style, instrumentation, mood and atmosphere, estimated tempo (BPM), key if identifiable,',
      'structure, and whether it loops seamlessly. Answer in English as one concise paragraph, without preamble.',
    ].join(' ');

    try {
      const response = await this.client.models.generateContent({
        model: this.analysisModel,
        contents: [
          {
            role: 'user',
            parts: [
              { text: instruction },
              { inlineData: { mimeType: audioMimeType(audioPath), data: audioBuffer.toString('base64') } },
            ],
          },
        ],
      });
      const text = response.text?.trim();
      if (!text) throw new Error('empty response');
      return text;
    } catch (error) {
      throw new Error(`Reference analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
