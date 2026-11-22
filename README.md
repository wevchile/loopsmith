# loopsmith

Loopsmith is a local web application that helps you create and edit video game music and sound with AI. It runs entirely on your PC (localhost) and uses Google's Lyria 3.5 AI model via the Gemini API to generate high-quality audio.

## Features

- **Multiple projects**: Organize audio by game/project with configurable context
- **AI music generation**: Generate music from text prompts using Google Lyria 3.5
- **Instrumental/vocal control**: Toggle vocals on/off per generation or project default
- **Reference-based variants**: Analyze existing audio and create AI-guided variants
- **Audio player**: Play, pause, seek, loop, adjust volume, with waveform visualization
- **Manifest linking**: Link external game audio manifests for read-only browsing
- **Generation history**: Track all generations with prompts, params, and timestamps
- **Internationalization**: Spanish (default) and English UI with language switcher
- **Path safety**: Server-side validation prevents path traversal attacks

## Requirements

- **Node.js**: 20.0.0 or higher
- **pnpm**: 9.0.0 or higher
- **Google Gemini API key**: Get one at https://aistudio.google.com/api-keys

## Installation

### Windows

1. Install Node.js from https://nodejs.org/ (download the LTS version)
2. Install pnpm:
   ```bash
   npm install -g pnpm
   ```
3. Clone or download this repository
4. Open a terminal (Command Prompt or PowerShell) in the loopsmith folder
5. Install dependencies:
   ```bash
   pnpm install
   ```
6. Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```
7. Edit `.env` and add your Gemini API key

### macOS

1. Install Node.js from https://nodejs.org/ or use Homebrew:
   ```bash
   brew install node
   ```
2. Install pnpm:
   ```bash
   npm install -g pnpm
   ```
3. Clone or download this repository
4. Open Terminal in the loopsmith folder
5. Install dependencies:
   ```bash
   pnpm install
   ```
6. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
7. Edit `.env` and add your Gemini API key

### Linux

1. Install Node.js (use your distribution's package manager or download from https://nodejs.org/)
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install nodejs npm
   
   # Fedora
   sudo dnf install nodejs npm
   ```
2. Install pnpm:
   ```bash
   npm install -g pnpm
   ```
3. Clone or download this repository
4. Open a terminal in the loopsmith folder
5. Install dependencies:
   ```bash
   pnpm install
   ```
6. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
7. Edit `.env` and add your Gemini API key

## Configuration

### Getting a Gemini API Key

1. Go to https://aistudio.google.com/api-keys
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and paste it into your `.env` file:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   ```

### Storage Roots

By default, Loopsmith stores projects in `./loopsmith-data` inside the repo. You can configure additional storage roots in `.env`:

```
LOOPSMITH_ROOTS=./loopsmith-data,/path/to/another/folder
```

Separate multiple paths with commas. Use absolute paths or paths relative to the repo root.

## Running Loopsmith

Start both the web app and server with a single command:

```bash
pnpm dev
```

This will:
- Start the server on http://127.0.0.1:3001
- Start the web app on http://localhost:3000
- Open your browser automatically

The app is now running locally on your PC.

## Usage Walkthrough

### 1. Create a Project

- Click "Create Project" in the left sidebar
- Enter a project name (e.g., "My Game")
- Optionally add a context (e.g., "retro 8-bit style") that will be prepended to all prompts
- Choose whether to enable vocals by default
- Click "Create"

### 2. Generate Audio

- Select your project from the sidebar
- In the right panel, enter a prompt describing the music you want:
  - "An upbeat chiptune battle theme in C major"
  - "A calm ambient forest soundscape with birds"
  - "Epic orchestral boss fight music with heavy drums"
- Choose whether to enable vocals (if supported by the provider)
- Optionally set a duration in seconds
- Select an output folder (SOUNDTRACK, SFX, VO, AMBIENCE, or OTHER)
- Click "Generate"

### 3. Play Audio

- Generated tracks appear in the center panel, grouped by type
- Click a track to expand it and show the audio player
- Use the player controls to play, pause, loop, and adjust volume
- The waveform visualization shows the audio structure

### 4. Create Variants (Reference-Based Generation)

Since Lyria doesn't support direct reference audio, Loopsmith implements a "guided variant" workflow:

- Click "Use as reference" on any track
- The track is analyzed by Gemini to describe its characteristics (genre, instruments, mood, BPM, key)
- Enter your variation prompt (e.g., "make it faster and more aggressive")
- The AI generates a new track based on the description + your prompt
- The result is saved as a new file, not an edit of the original

### 5. View History

- Access your project's generation history via the API endpoint `/api/projects/:id/history`
- Each entry includes the original prompt, composed prompt, model, parameters, and output path

### 6. Link a Game Manifest (Optional)

If you have an external game repository with audio files:

1. Create a manifest JSON file in your game repo (see "Manifest Format" below)
2. Use the manifest linking API to preview and apply it:
   - Preview: `POST /api/manifest/preview` with `projectId` and `manifestPath`
   - Link: `POST /api/manifest/link` with `projectId` and `manifestPath`
3. The manifest's audio files are displayed in Loopsmith (read-only from their original paths)

## Manifest Format

A Loopsmith manifest is a JSON file that describes audio files in an external game repository. Here's an example:

```json
{
  "version": "1.0",
  "gameRepo": "my-game",
  "entries": [
    {
      "id": "bgm_001",
      "name": "Main Theme",
      "type": "SOUNDTRACK",
      "folder": "music",
      "relativePath": "assets/audio/music/main_theme.mp3",
      "hash": "sha256:abc123...",
      "duration": 120.5,
      "loopMarkers": {
        "start": 10.0,
        "end": 110.0
      }
    },
    {
      "id": "sfx_button_01",
      "name": "Button Click",
      "type": "SFX",
      "folder": "ui",
      "relativePath": "assets/audio/sfx/ui/button_click.wav",
      "hash": "sha256:def456...",
      "duration": 0.3
    }
  ]
}
```

The manifest schema is published at `schemas/manifest.schema.json` and can be used to validate your manifest files.

### Generating a Manifest

See `docs/MANIFEST_GENERATOR_PROMPT.md` for a ready-to-paste prompt you can give to an AI coding assistant in your game repo to automatically generate a valid manifest.

## Adding a New AI Provider

Loopsmith uses a pluggable provider architecture. To add a new music generation provider:

1. Create a new file in `packages/providers/src/` (e.g., `my-provider.ts`)
2. Implement the `MusicProvider` interface:

```typescript
import type { MusicProvider, ProviderConfig } from './provider.js';
import type { GenerateRequest, GenerateResult, ProviderCapabilities } from '@loopsmith/core';

export class MyProvider implements MusicProvider {
  readonly id = 'my-provider';
  readonly name = 'My Provider';
  readonly capabilities: ProviderCapabilities = {
    supportsInstrumental: true,
    supportsVocals: false,
    supportsReferenceAudio: true,
    maxDurationSeconds: 300,
    outputFormats: ['mp3', 'wav'],
  };

  constructor(config: ProviderConfig) {
    // Initialize your provider
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    // Implement generation logic
    // Return { audioData: Buffer, format: string, lyrics?: string, metadata?: object }
  }

  async analyzeReference?(audioPath: string): Promise<string> {
    // Optional: implement reference audio analysis
  }
}
```

3. Register your provider in `packages/providers/src/provider-registry.ts`:

```typescript
import { MyProvider } from './my-provider.js';

// In createDefault():
if (config.myProviderApiKey) {
  const myProvider = new MyProvider(config);
  registry.registerProvider(myProvider);
}
```

4. Add any required config to `apps/server/src/config.ts`
5. Update `.env.example` with the new config

## Technical Architecture

Loopsmith is a TypeScript pnpm monorepo with the following structure:

- `apps/web`: Vite + React frontend with i18next for internationalization
- `apps/server`: Node + Fastify backend with path traversal protection
- `packages/core`: Domain logic, manifest sync, classifier, path safety
- `packages/providers`: Pluggable AI provider interface + Gemini Lyria implementation

### Why Lyria 3.5?

As of November 2026, Lyria 3.5 (`lyria-3.5`) is Google's stable, generally available music generation model. It supports:
- Full-length songs (up to 3 minutes)
- 44.1 kHz stereo audio (MP3/WAV)
- Text and image inputs
- Instrumental and vocal generation
- Fine-grained control via timestamps and structure tags

Lyria RealTime is not included in v0.1 because it's designed for streaming use cases, while Loopsmith generates and saves complete audio files.

## Development Commands

- `pnpm dev` - Start both web and server in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run all tests
- `pnpm lint` - Type-check all packages
- `pnpm typecheck` - Run TypeScript type checking

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Limitations

- **Lyria 3.5 cost**: $0.08 per generated song (no free tier)
- **API key required**: You must provide your own Gemini API key
- **No multi-turn editing**: Each generation is independent; iterative refinement requires new generations
- **Safety filters**: Prompts requesting specific artist voices or copyrighted lyrics are blocked
- **Watermarking**: All generated audio includes an imperceptible SynthID watermark
- **Windows compatibility**: All paths use Node.js path module for cross-platform compatibility
