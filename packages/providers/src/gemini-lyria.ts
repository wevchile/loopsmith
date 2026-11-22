import { GoogleGenAI } from '@google/genai';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { GenerateRequest, GenerateResult, ProviderCapabilities } from '@loopsmith/core';
import type { MusicProvider, ProviderConfig } from './provider.js';
import {
  DEFAULT_REFINE_MODEL,
  REFINER_SYSTEM_INSTRUCTION,
  buildRefinerUserMessage,
  REFINE_TEMPERATURE,
  cleanRefinedPrompt,
  type RefineInput,
} from './prompt-refiner.js';

/**
 * Default Lyria model: the only stable (non-preview) one, for full songs.
 * See https://ai.google.dev/gemini-api/docs/music-generation and https://ai.google.dev/gemini-api/docs/models
 */
export const DEFAULT_LYRIA_MODEL = 'lyria-3.5';
/** Model for short loops (duration up to SHORT_MODEL_MAX_SECONDS): fixed 30 s clips, cheaper and made for loops. */
export const DEFAULT_LYRIA_MODEL_SHORT = 'lyria-3-clip-preview';
/** Model for longer tracks or pieces without a duration. */
export const DEFAULT_LYRIA_MODEL_LONG = DEFAULT_LYRIA_MODEL;
/** Longest duration served by the short model (its 30 s clip must cover N plus the 0.25 s loop seam). */
export const SHORT_MODEL_MAX_SECONDS = 29;
/**
 * Gemini API version. Lyria models are only served on v1beta (on v1 the API answers
 * "404 Model 'lyria-3.5' not found"), while @google/genai defaults to v1.
 */
export const DEFAULT_API_VERSION = 'v1beta';
/** Stable Gemini model used to listen to a reference track and describe it. */
export const DEFAULT_ANALYSIS_MODEL = 'gemini-3.6-flash';

export const INSTRUMENTAL_DIRECTIVE = 'Instrumental only, no vocals, no singing, no spoken words.';

export type LyriaModelStatus = 'stable' | 'preview' | 'experimental' | 'unknown';

/** What Loopsmith knows about a Lyria model (from the Gemini API docs, November 2026). */
export interface LyriaModelInfo {
  id: string;
  label: string;
  status: LyriaModelStatus;
  /** "interactions" = one request returns a finished file. "live" = WebSocket streaming (not supported here). */
  api: 'interactions' | 'live';
  /** Set when the model always returns the same length (Lyria 3 Clip: 30 s). */
  fixedDurationSeconds?: number;
  /** Longest output we expect. Used to cap the duration field. */
  maxDurationSeconds: number;
  /** Only Lyria 3.5 documents WAV output; the others always return MP3. */
  supportsWav: boolean;
  /** Paid tier price per generated song, in USD. */
  priceUsd?: number;
  notes: string;
}

export const LYRIA_MODELS: readonly LyriaModelInfo[] = [
  {
    id: 'lyria-3.5',
    label: 'Lyria 3.5',
    status: 'stable',
    api: 'interactions',
    maxDurationSeconds: 240,
    supportsWav: true,
    priceUsd: 0.08,
    notes: 'Flagship model. Full songs of a couple of minutes; length is only a prompt hint. MP3 or WAV.',
  },
  {
    id: 'lyria-3-clip-preview',
    label: 'Lyria 3 Clip (preview)',
    status: 'preview',
    api: 'interactions',
    fixedDurationSeconds: 30,
    maxDurationSeconds: 30,
    supportsWav: false,
    priceUsd: 0.04,
    notes: 'Short clips, loops and previews. Always returns 30 s of MP3. Faster and cheaper.',
  },
  {
    id: 'lyria-3-pro-preview',
    label: 'Lyria 3 Pro (preview)',
    status: 'preview',
    api: 'interactions',
    maxDurationSeconds: 240,
    supportsWav: false,
    priceUsd: 0.08,
    notes: 'Previous generation full-song model. Google recommends lyria-3.5 as its replacement. MP3 only.',
  },
  {
    id: 'lyria-realtime-exp',
    label: 'Lyria RealTime (experimental)',
    status: 'experimental',
    api: 'live',
    maxDurationSeconds: 0,
    supportsWav: false,
    notes: 'Real-time WebSocket streaming of raw PCM for interactive apps. Not supported by Loopsmith.',
  },
];

/** Returns the catalog entry for a model id, or a generic Interactions API entry for unknown ids. */
export function getLyriaModelInfo(modelId: string): LyriaModelInfo {
  const known = LYRIA_MODELS.find((m) => m.id === modelId);
  if (known) return known;
  return {
    id: modelId,
    label: modelId,
    status: 'unknown',
    api: 'interactions',
    maxDurationSeconds: 240,
    supportsWav: false,
    notes: 'Not in the Loopsmith catalog; called through the Interactions API and requested as MP3.',
  };
}

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
      config?: { systemInstruction?: string; temperature?: number };
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
export function formatSeconds(totalSeconds: number): string {
  const total = Math.round(totalSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0
    ? `${minutes} minute${minutes > 1 ? 's' : ''}${seconds > 0 ? ` ${seconds} second${seconds > 1 ? 's' : ''}` : ''}`
    : `${seconds} second${seconds > 1 ? 's' : ''}`;
}

function timestamp(totalSeconds: number): string {
  const total = Math.round(totalSeconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Builds the final prompt sent to Lyria. Instrumental is the default: unless vocals are
 * explicitly enabled, an explicit "no vocals" directive is always appended.
 * Lyria has no duration parameter, so the length is requested in words and with a
 * timestamped structure (the method the docs recommend). Models with a fixed length skip it.
 */
export function buildLyriaPrompt(
  request: Pick<GenerateRequest, 'prompt' | 'vocalsEnabled' | 'duration'>,
  model?: Pick<LyriaModelInfo, 'fixedDurationSeconds'>
): string {
  const parts: string[] = [];

  if (request.duration && request.duration > 0 && !model?.fixedDurationSeconds) {
    const end = timestamp(request.duration);
    parts.push(
      `Create a short track that lasts exactly ${formatSeconds(request.duration)} in total. ` +
        `Structure: [0:00 - ${end}] one compact section with no long intro, ending cleanly at ${end}.`
    );
  }

  parts.push(request.prompt.trim());

  if (request.vocalsEnabled) {
    parts.push('Vocals are allowed.');
  } else {
    parts.push(INSTRUMENTAL_DIRECTIVE);
  }

  return parts.join('\n\n');
}

/** Lines such as "[[A0]]" (lyria-3.5, lyria-3-pro-preview) or "<instrumental>" (lyria-3-clip-preview). */
const SECTION_MARKER_LINE = /^\s*(\[\[[^\]]*\]\]|<[^<>]*>)\s*$/;

/**
 * Lyria returns its song structure as text. For instrumental tracks that text is only
 * markers such as "[[A0]]" or "<instrumental>" (or a JSON structure description), which are not lyrics.
 * Returns the real lyrics (marker lines removed) and the raw structure separately.
 */
export function splitLyriaText(text: string | undefined): { lyrics?: string; structure?: string } {
  const raw = text?.trim();
  if (!raw) return {};
  if (raw.startsWith('{') || raw.startsWith('[{')) {
    try {
      JSON.parse(raw);
      return { structure: raw };
    } catch {
      // not JSON, treat as text
    }
  }
  const lines = raw.split(/\r?\n/);
  const lyricLines = lines.filter((line) => !SECTION_MARKER_LINE.test(line));
  const lyrics = lyricLines.join('\n').trim();
  const hasMarkers = lyricLines.length !== lines.length;
  return {
    ...(lyrics ? { lyrics } : {}),
    ...(hasMarkers || !lyrics ? { structure: raw } : {}),
  };
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
  readonly modelInfo: LyriaModelInfo;
  readonly capabilities: ProviderCapabilities;

  private readonly client: GenAIClientLike;
  private readonly analysisModel: string;
  readonly refineModel: string;
  /** LYRIA_MODEL: when set, every request uses it, whatever the duration. */
  readonly modelOverride?: string;
  /** LYRIA_MODEL_SHORT and LYRIA_MODEL_LONG: picked by duration when there is no override. */
  readonly modelShort: string;
  readonly modelLong: string;
  /** Longest duration (seconds) that goes to the short model. */
  readonly shortMaxSeconds: number;
  private readonly outputFormat: 'mp3' | 'wav';

  constructor(config: ProviderConfig, client?: GenAIClientLike) {
    if (!config.apiKey && !client) {
      throw new Error('GEMINI_API_KEY is required for the Gemini Lyria provider');
    }
    this.modelOverride = config.lyriaModel?.trim() || undefined;
    this.modelShort = this.modelOverride ?? (config.lyriaModelShort?.trim() || DEFAULT_LYRIA_MODEL_SHORT);
    this.modelLong = this.modelOverride ?? (config.lyriaModelLong?.trim() || DEFAULT_LYRIA_MODEL_LONG);
    for (const [variable, id] of [
      [this.modelOverride ? 'LYRIA_MODEL' : 'LYRIA_MODEL_SHORT', this.modelShort],
      [this.modelOverride ? 'LYRIA_MODEL' : 'LYRIA_MODEL_LONG', this.modelLong],
    ] as const) {
      if (getLyriaModelInfo(id).api !== 'interactions') {
        throw new Error(
          `${id} is a real-time streaming model and cannot generate files. ` +
            `Set ${variable} to one of: ${LYRIA_MODELS.filter((m) => m.api === 'interactions').map((m) => m.id).join(', ')} (default lyria-3.5).`
        );
      }
    }
    const shortInfo = getLyriaModelInfo(this.modelShort);
    const longInfo = getLyriaModelInfo(this.modelLong);
    this.shortMaxSeconds = Math.min(
      SHORT_MODEL_MAX_SECONDS,
      shortInfo.fixedDurationSeconds ? shortInfo.fixedDurationSeconds - 1 : shortInfo.maxDurationSeconds
    );
    this.model = this.modelShort;
    this.modelInfo = shortInfo;
    this.name = this.modelOverride ? `Google ${shortInfo.label}` : `Google ${shortInfo.label} / ${longInfo.label}`;
    this.capabilities = {
      supportsInstrumental: true,
      supportsVocals: true,
      supportsReferenceAudio: false,
      maxDurationSeconds: Math.max(shortInfo.maxDurationSeconds, longInfo.maxDurationSeconds),
      ...(this.modelOverride && shortInfo.fixedDurationSeconds ? { fixedDurationSeconds: shortInfo.fixedDurationSeconds } : {}),
      outputFormats: shortInfo.supportsWav || longInfo.supportsWav ? ['mp3', 'wav'] : ['mp3'],
    };
    this.analysisModel = config.analysisModel || DEFAULT_ANALYSIS_MODEL;
    this.refineModel = config.refineModel || DEFAULT_REFINE_MODEL;
    this.outputFormat = config.outputFormat === 'wav' ? 'wav' : 'mp3';
    this.client = client ?? createGenAIClient(config.apiKey as string, config.apiVersion || DEFAULT_API_VERSION);
  }

  /**
   * Model for a duration: LYRIA_MODEL when set; otherwise the short model up to shortMaxSeconds
   * and the long model for longer tracks or when there is no duration.
   */
  selectModel(durationSeconds?: number): string {
    if (this.modelOverride) return this.modelOverride;
    return durationSeconds && durationSeconds > 0 && durationSeconds <= this.shortMaxSeconds ? this.modelShort : this.modelLong;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const model = request.model ?? this.selectModel(request.duration);
    const modelInfo = getLyriaModelInfo(model);
    // A final prompt already contains the length, loop and instrumental wording.
    const prompt = request.promptIsFinal ? request.prompt.trim() : buildLyriaPrompt(request, modelInfo);
    const requested = request.outputFormat ?? this.outputFormat;
    // Only Lyria 3.5 documents WAV output; ask the other models for their native MP3.
    const format = requested === 'wav' && modelInfo.supportsWav ? 'wav' : 'mp3';

    const params: LyriaInteractionParams = { model, input: prompt };
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

    const { lyrics, structure } = splitLyriaText(parsed.text);
    return {
      audioData: parsed.audio,
      format: formatFromMime(parsed.mimeType, format),
      lyrics,
      structure,
      metadata: {
        model,
        prompt,
        vocalsEnabled: request.vocalsEnabled,
        mimeType: parsed.mimeType,
      },
    };
  }

  /** Asks a Gemini text model to turn the request into a polished Lyria prompt. */
  async refinePrompt(input: RefineInput): Promise<{ prompt: string; model: string }> {
    const response = await this.client.models.generateContent({
      model: this.refineModel,
      contents: [{ role: 'user', parts: [{ text: buildRefinerUserMessage(input) }] }],
      config: { systemInstruction: REFINER_SYSTEM_INSTRUCTION, temperature: REFINE_TEMPERATURE },
    });
    const text = response.text?.trim();
    if (!text) throw new Error(`${this.refineModel} returned an empty prompt`);
    return { prompt: cleanRefinedPrompt(text), model: this.refineModel };
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
