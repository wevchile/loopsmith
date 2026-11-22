# loopsmith

Loopsmith is a free, open source (MIT) web app that runs on your own computer and helps you create and edit music and sound for video games with AI. The first AI provider is Google Lyria through the Gemini API, and the code is organized so more music AIs can be added later.

The interface is in Spanish by default and can be switched to English.

## Features

- **Projects per game**: each game is a folder on your disk with its own settings, sounds and history.
- **Folders CRUD**: create, rename and delete folders and subfolders. New projects start with one folder per sound type: `SOUNDTRACK`, `SFX`, `VO`, `AMBIENCE`, `OTHER`.
- **Project context (optional)**: a text such as "everything in retro 8-bit style" that is added to every prompt of the project.
- **Generate music from a prompt** with Lyria. Files are saved locally in the folder you choose.
- **Instrumental by default**: a switch allows vocals per generation, and each project has its own default.
- **Variants from a base track**: switch on "use the selected track as the base", Gemini listens to it and describes it, and Lyria creates a new variant with your changes. The original file is never modified.
- **Player**: play, pause, stop, loop, volume and waveform.
- **History**: every generation is recorded with its prompt, final prompt, model, vocals setting and output file.
- **Game manifest**: link a `loopsmith-manifest.json` generated in your game repository to browse and play the game's existing sounds, grouped by type. When the game changes, Loopsmith shows what was added, removed, renamed, moved or updated before applying it.
- **Local and safe**: the server only listens on `127.0.0.1` and only reads and writes inside your configured folders (and, for a linked manifest, inside the manifest's folder).

## Requirements

- **Node.js 22 or newer** (tested with Node 24): https://nodejs.org/
- **pnpm 10 or newer** (tested with pnpm 12.18): https://pnpm.io/installation
- **Git** to clone the repository.
- **A Gemini API key** for AI generation: https://aistudio.google.com/api-keys (optional to try the app; see "Running without an API key").
- **ffmpeg** (optional, recommended): used to cut generated music to the requested duration with a fade-out. On Windows: `winget install Gyan.FFmpeg`. Without it Loopsmith uses a built-in cutter.

## Installation

### Windows (PowerShell)

```powershell
# 1. Install pnpm if you do not have it (or follow https://pnpm.io/installation)
npm install -g pnpm

# 2. Clone the repository
cd C:\github
git clone https://github.com/wevchile/loopsmith.git
cd loopsmith

# 3. Install dependencies
pnpm install

# 4. Create your .env from the example and edit it
Copy-Item .env.example .env
notepad .env
```

### macOS / Linux

```bash
npm install -g pnpm
git clone https://github.com/wevchile/loopsmith.git
cd loopsmith
pnpm install
cp .env.example .env
# edit .env with your editor
```

### About `pnpm install` and install scripts

Recent pnpm versions block dependency install scripts unless they are approved. The approvals are already in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: true      # needed by Vite and tsx
  protobufjs: false  # optional version check, not needed
```

So `pnpm install` works without running `pnpm approve-builds`. The lockfile is also compatible with pnpm's `minimumReleaseAge` supply chain policy. If pnpm warns that the `pnpm` field in `package.json` is ignored, you are on an old checkout: pull the latest version.

## Configuration (`.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | (empty) | Your key from https://aistudio.google.com/api-keys. Required only for generation. |
| `GEMINI_API_VERSION` | `v1beta` | Gemini API version. Lyria is only served on `v1beta`; keep the default. |
| `LYRIA_MODEL` | `lyria-3.5` | Lyria model, see "Lyria models" below. |
| `LYRIA_OUTPUT_FORMAT` | `mp3` | `mp3` or `wav` (`wav` only with `lyria-3.5`). |
| `LOOPSMITH_TRIM_TO_DURATION` | `true` | Cut results longer than the duration field to that length, with a fade-out. |
| `LOOPSMITH_KEEP_UNTRIMMED` | `true` | Keep the full model output in `<project>/.loopsmith-untrimmed`. |
| `LOOPSMITH_FADE_OUT_SECONDS` | `1.5` | Fade-out length when trimming. |
| `LOOPSMITH_FFMPEG` | `ffmpeg` | ffmpeg executable, or `off` to use the built-in cutter. |
| `GEMINI_ANALYSIS_MODEL` | `gemini-3.6-flash` | Model that describes a base track for variants. |
| `LOOPSMITH_ROOTS` | `./loopsmith-data` | Comma separated folders where projects live. Relative paths start at the repository folder. |
| `LOOPSMITH_SERVER_PORT` | `3001` | API port (always bound to 127.0.0.1). |
| `LOOPSMITH_WEB_PORT` | `3000` | Web app port. |
| `LOOPSMITH_OPEN_BROWSER` | `true` | Open the browser when running `pnpm dev`. |

Restart `pnpm dev` after changing `.env`.

Only `GEMINI_API_KEY` is needed to generate. Keys created in AI Studio work in both formats (`AIza...` and `AQ...`). `GOOGLE_CLOUD_PROJECT` and other Vertex AI settings are not used.

## Running

```bash
pnpm dev
```

This builds the shared packages and starts:

- the web app at http://127.0.0.1:3000 (opens in your browser)
- the API at http://127.0.0.1:3001 (health check: http://127.0.0.1:3001/api/health)

Stop it with `Ctrl+C`.

### Running without an API key

Everything except generation works without `GEMINI_API_KEY`: projects, folders, context, the player and manifests. The app shows a yellow banner explaining how to add the key, and the Generate button stays disabled. The API answers generation requests with HTTP 503 and the code `API_KEY_MISSING`.

## Using Loopsmith

1. **Create a project** with "Nuevo proyecto / New project". Give it a name and, optionally, a context such as `retro 8-bit, chiptune, fast tempo`. A folder is created in your first root with the five type folders.
2. **Organize folders** in the "Carpetas / Folders" panel: hover a folder to add a subfolder (+), rename it or delete it.
3. **Generate**: write a prompt, keep "Allow vocals" off for instrumental music (default) or switch it on, choose where to save it and press Generate. The file appears in the sounds list and in the history.
4. **Listen**: click a sound to open the player (play, pause, stop, loop, volume).
5. **Create a variant**: click "Use as base" on a sound (or switch on "Use the selected track as the base"), describe the changes ("faster and darker") and generate. A new file is created next to the others.
6. **Link your game** (optional): see the next section.

All data is stored as plain files inside each project folder:

```
loopsmith-data/
  My_Game/
    loopsmith.project.json   project settings (name, context, vocals default, linked manifest)
    history.json             generation history
    manifest.snapshot.json   last applied manifest (only when a manifest is linked)
    SOUNDTRACK/ SFX/ VO/ AMBIENCE/ OTHER/   your audio files and subfolders
```

## Linking a game with a manifest

A manifest is a JSON file that lists the sounds of a game repository: their name, type, folder and path. Loopsmith uses it to show and play the game's sounds without copying them.

1. Open your game repository with an AI coding assistant and paste the prompt from [`docs/MANIFEST_GENERATOR_PROMPT.md`](docs/MANIFEST_GENERATOR_PROMPT.md). It creates `loopsmith-manifest.json` at the root of the game repository.
2. In Loopsmith, open your project, paste the absolute path of that file in "Manifiesto del juego / Game manifest" (for example `C:\games\my-game\loopsmith-manifest.json`) and press "Review changes".
3. Check the summary and press "Link". The game's sounds appear in the list, marked as `manifest`.
4. When the game changes, regenerate the manifest in the game repository and press "Check for changes" in Loopsmith. You will see what was added, removed, renamed, moved or updated, and nothing changes until you press "Apply". Your generated files are never touched.

Rules:

- `relativePath` is relative to the folder that contains the manifest. Entries that point outside that folder are rejected.
- Matching between versions uses `id` first and then `hash`, so keep ids stable and include a content hash to detect renames and moves.
- The JSON Schema is in [`schemas/manifest.schema.json`](schemas/manifest.schema.json).

Example:

```json
{
  "version": "1.0",
  "gameRepo": "my-game",
  "entries": [
    {
      "id": "music-main-theme",
      "name": "main_theme.ogg",
      "type": "SOUNDTRACK",
      "folder": "music",
      "relativePath": "assets/audio/music/main_theme.ogg",
      "hash": "sha256:9f2c...",
      "duration": 120.5,
      "loopMarkers": { "start": 10.0, "end": 110.0 }
    },
    {
      "id": "sfx-ui-click",
      "name": "click.wav",
      "type": "SFX",
      "folder": "ui",
      "relativePath": "assets/audio/sfx/ui/click.wav",
      "hash": "sha256:41ab..."
    }
  ]
}
```

## About Lyria

Loopsmith uses the official [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK and the Gemini Interactions API (`POST v1beta/interactions`), as described in the [Lyria music generation guide](https://ai.google.dev/gemini-api/docs/music-generation).

- **API version `v1beta` is required.** The SDK defaults to `v1`, where the API answers `404 Model 'lyria-3.5' not found`. Loopsmith creates the client with `apiVersion: 'v1beta'` (configurable with `GEMINI_API_VERSION`).

### Lyria models

Set `LYRIA_MODEL` in `.env` and restart. Status and prices from the Gemini API docs ([music generation](https://ai.google.dev/gemini-api/docs/music-generation), [models](https://ai.google.dev/gemini-api/docs/models), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [deprecations](https://ai.google.dev/gemini-api/docs/deprecations)), November 2026:

| Model | Status | Length | Output | Price (paid tier) | Notes |
| --- | --- | --- | --- | --- | --- |
| `lyria-3.5` (default) | Stable | A couple of minutes, prompt hint only | MP3 or WAV, 44.1 kHz stereo | USD 0.08 per song | Flagship. Best structure and quality. |
| `lyria-3-clip-preview` | Preview | Always 30 s | MP3, stereo | USD 0.04 per clip | Short clips and loops, faster. Good to iterate on prompts. |
| `lyria-3-pro-preview` | Preview, previous generation | A couple of minutes | MP3, stereo | USD 0.08 per song | Google lists `lyria-3.5` as its replacement. |
| `lyria-realtime-exp` | Experimental | Endless live stream | Raw PCM over WebSocket | - | Not supported: it streams live and cannot return a file. Loopsmith shows a configuration error if selected. |

There is no free tier for Lyria. Every model above (except RealTime) is called the same way, with the Interactions API on `v1beta`. Unknown model ids are passed through the same way, so new Lyria models can be tried from `.env` without code changes.

### Duration

**Lyria has no duration parameter.** The Interactions API rejects fields such as `generation_config.duration` (`Unknown parameter`), the clip model is fixed at 30 seconds, and `lyria-3.5` and `lyria-3-pro-preview` ignore it in practice (in our tests, asking for 16 seconds in both the prompt and a timestamped structure returned 164 and 162 seconds). So Loopsmith does two things:

1. It asks for the length in the prompt with a timestamped structure (for example `[0:00 - 0:16]`), the method the docs recommend.
2. If the result is still longer than the duration field (by more than half a second), it **cuts it locally** to that length with a 1.5 second fade-out (ffmpeg when installed, otherwise a built-in cutter). The untouched file is kept in `<project>/.loopsmith-untrimmed/`, and the history entry records the requested, generated and final lengths.

Leave the duration empty to keep whatever length Lyria returns. With `lyria-3-clip-preview` you get 30 seconds, so durations up to 30 seconds are cut from that clip.

### Other notes

- **Instrumental vs vocals**: Lyria has no separate "instrumental" parameter, so when vocals are off Loopsmith adds an explicit "Instrumental only, no vocals" instruction to the prompt, as recommended in the guide.
- **Variants**: Lyria does not accept an audio file as input, so the "base track" option first asks a Gemini model to describe the track (genre, instruments, mood, tempo, key) and then sends that description plus your changes to Lyria.
- Lyria only creates music. It works well for `SOUNDTRACK` and reasonably for `AMBIENCE`, not for real sound effects or voice lines. Those types are ready for future providers.
- **Song structure is not lyrics**: Lyria returns a structure text with every track. For instrumentals it is only markers such as `[[A0]]` or `<instrumental>`; Loopsmith saves it as `structure` in the history and only shows real lyrics as lyrics.
- Generation is billed by Google per request; check https://ai.google.dev/gemini-api/docs/pricing before generating a lot. All generated audio carries an inaudible SynthID watermark.

## Adding another AI provider

1. Create `packages/providers/src/my-provider.ts` implementing `MusicProvider` from `packages/providers/src/provider.ts` (`id`, `name`, `model`, `capabilities`, `generate()` and optionally `analyzeReference()`).
2. Register it in `ProviderRegistry.createDefault()` in `packages/providers/src/provider-registry.ts` when its configuration is present.
3. Add its settings to `apps/server/src/config.ts` and `.env.example`.

## Project structure

```
apps/web            Vite + React UI (react-i18next, wavesurfer.js)
apps/server         Fastify API bound to 127.0.0.1 (projects, folders, audio streaming, manifests, generation)
packages/core       Shared types, manifest schema and sync, sound classifier, path safety
packages/providers  AI provider interface and the Gemini Lyria provider
schemas/            JSON Schema of the manifest
docs/               Prompt to generate a manifest from a game repository
```

## Development

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds shared packages, starts web and API in watch mode |
| `pnpm build` | Builds every package and the web app |
| `pnpm typecheck` | TypeScript checks for every package |
| `pnpm lint` | Same as `typecheck` for now |
| `pnpm test` | Runs the unit and API tests (Vitest) |
| `pnpm clean` | Deletes build output (`dist` folders) |

Build output and TypeScript incremental files (`dist/`, `*.tsbuildinfo`) are never committed.

## License

[MIT](LICENSE)
