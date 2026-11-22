import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerateRequest, GenerateResult, ProviderCapabilities } from '@loopsmith/core';
import type { MusicProvider, ProviderConfig } from './provider.js';
import { readFile } from 'node:fs/promises';

const LYRIA_MODEL = 'lyria-3.5';
const GEMINI_ANALYSIS_MODEL = 'gemini-2.0-flash';

export class GeminiLyriaProvider implements MusicProvider {
  readonly id = 'gemini-lyria';
  readonly name = 'Google Lyria 3.5';
  readonly capabilities: ProviderCapabilities = {
    supportsInstrumental: true,
    supportsVocals: true,
    supportsReferenceAudio: false,
    maxDurationSeconds: 180,
    outputFormats: ['mp3', 'wav'],
  };

  private client: GoogleGenerativeAI;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    let finalPrompt = request.prompt;

    if (!request.vocalsEnabled && !finalPrompt.toLowerCase().includes('instrumental')) {
      finalPrompt += '. Instrumental only, no vocals.';
    }

    if (request.duration) {
      const minutes = Math.floor(request.duration / 60);
      const seconds = request.duration % 60;
      if (minutes > 0) {
        finalPrompt = `Create a ${minutes} minute${seconds > 0 ? ` and ${seconds} second` : ''} track. ${finalPrompt}`;
      } else {
        finalPrompt = `Create a ${seconds} second track. ${finalPrompt}`;
      }
    }

    try {
      const model = this.client.getGenerativeModel({ model: LYRIA_MODEL });
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
      });

      const response = result.response;
      
      let audioData: Buffer | null = null;
      let lyrics: string | undefined;

      for (const candidate of response.candidates || []) {
        for (const part of candidate.content.parts || []) {
          if ('inlineData' in part && part.inlineData?.mimeType?.startsWith('audio/')) {
            const base64Data = part.inlineData.data;
            audioData = Buffer.from(base64Data, 'base64');
          } else if ('text' in part && part.text) {
            if (!lyrics) {
              lyrics = part.text;
            }
          }
        }
      }

      if (!audioData) {
        throw new Error('No audio data received from Lyria');
      }

      return {
        audioData,
        format: 'mp3',
        lyrics,
        metadata: {
          model: LYRIA_MODEL,
          prompt: finalPrompt,
        },
      };
    } catch (error) {
      throw new Error(`Gemini Lyria generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async analyzeReference(audioPath: string): Promise<string> {
    try {
      const audioBuffer = await readFile(audioPath);
      const base64Audio = audioBuffer.toString('base64');

      const mimeType = this.getMimeType(audioPath);

      const model = this.client.getGenerativeModel({ model: GEMINI_ANALYSIS_MODEL });
      
      const prompt = `Analyze this audio and provide a detailed description suitable for music generation. Include:
- Genre and style
- Instrumentation
- Mood and atmosphere
- Tempo (BPM estimate)
- Key signature (if identifiable)
- Notable characteristics

Format as a concise paragraph suitable for use as a generation prompt.`;

      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
          ],
        }],
      });

      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new Error('No analysis text received from Gemini');
      }

      return text;
    } catch (error) {
      throw new Error(`Audio analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    switch (ext) {
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'm4a':
        return 'audio/mp4';
      default:
        return 'audio/mpeg';
    }
  }
}
